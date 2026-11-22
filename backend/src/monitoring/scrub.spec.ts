import type { ErrorEvent } from '@sentry/nestjs';
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from './scrub';

describe('scrub (lo que va a Sentry)', () => {
  it('borra los correos de un texto', () => {
    expect(
      scrubText('Invalid `to` field: Ana.Perez+1@gmail.com, otro@x.cl'),
    ).toBe('Invalid `to` field: [correo], [correo]');
  });

  it('borra teléfonos y números largos', () => {
    expect(scrubText('tel +56 9 1234 5678 y 912345678, a las 10:30')).toBe(
      'tel [número] y [número], a las 10:30',
    );
  });

  it('de un error de Prisma deja la consulta que falló y el motivo, sin valores', () => {
    const prisma = [
      '',
      'Invalid `this.prisma.customer.create()` invocation in',
      'C:\\app\\dist\\bookings\\bookings.service.js:101:52',
      '',
      '→ 101 const c = await this.prisma.customer.create({',
      '        data: { name: "Ana Pérez", phone: "+56911112222" }',
      '      })',
      '',
      'Unique constraint failed on the fields: (`email`)',
    ].join('\n');
    expect(scrubText(prisma)).toBe(
      'Invalid `this.prisma.customer.create()` invocation: Unique constraint failed on the fields: (`email`)',
    );
  });

  it('reemplaza ids y tokens de la ruta y quita la query', () => {
    expect(scrubUrl('/manage/cmbx1q2w30000abcd1234efgh/cancel')).toBe(
      '/manage/:id/cancel',
    );
    expect(
      scrubUrl(`https://reservahoy.cl/invitacion/${'a1'.repeat(32)}?x=1#y`),
    ).toBe('https://reservahoy.cl/invitacion/:id');
    expect(scrubUrl('/reset-password?token=abc')).toBe('/reset-password');
    // Rutas con parámetro y slugs cortos quedan igual
    expect(scrubUrl('/manage/:token')).toBe('/manage/:token');
    expect(scrubUrl('/public/demo-peluqueria/slots')).toBe(
      '/public/demo-peluqueria/slots',
    );
  });

  it('deja solo método y ruta de la petición, sin usuario', () => {
    const event = {
      request: {
        method: 'POST',
        url: 'http://api/public/demo/bookings?ref=a@b.cl',
        data: { email: 'cliente@gmail.com', phone: '+56911111111' },
        headers: { cookie: 'session=secreto', authorization: 'Bearer x' },
        cookies: { session: 'secreto' },
        query_string: 'ref=a@b.cl',
      },
      user: { ip_address: '1.2.3.4', email: 'a@b.cl' },
      message: 'falló para cliente@gmail.com',
      exception: { values: [{ type: 'Error', value: 'dup cliente@gmail.com' }] },
      breadcrumbs: [
        { category: 'console', message: 'cliente@gmail.com' },
        {
          category: 'http',
          data: { url: '/manage/cmbx1q2w30000abcd1234efgh?x=1' },
        },
      ],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.request).toEqual({
      method: 'POST',
      url: 'http://api/public/demo/bookings',
    });
    expect(out.user).toBeUndefined();
    expect(out.message).toBe('falló para [correo]');
    expect(out.exception?.values?.[0].value).toBe('dup [correo]');
    expect(out.breadcrumbs).toEqual([
      { category: 'http', data: { url: '/manage/:id' } },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/gmail|secreto|5691|1\.2\.3\.4/);
  });

  it('descarta las migas de la consola', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });
});
