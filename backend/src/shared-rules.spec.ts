import { BookingStatus } from '@prisma/client';
import { dayError } from '../../frontend/src/lib/hours';
import { mapsUrl as frontendMapsUrl } from '../../frontend/src/lib/maps';
import { canComplete } from '../../frontend/src/lib/types';
import { whatsappUrl as frontendWhatsappUrl } from '../../frontend/src/lib/whatsapp';
import { COMPLETABLE } from './agenda/agenda.service';
import { dayHoursError } from './working-hours/dto/set-working-hours.dto';
import { mapsUrl, whatsappUrl } from './notifications/notifications.service';

// Reglas que están dos veces, en el backend y en el panel: el panel avisa antes
// de enviar (o arma el mismo enlace) y el backend es quien decide. Si se cambia
// una copia y no la otra, falla aquí. (La limpieza de lo que va a Sentry se
// revisa igual en monitoring/scrub.spec.ts)

describe('reglas repetidas en el frontend', () => {
  it('canComplete deja completar desde los mismos estados que COMPLETABLE', () => {
    // Todos los estados de la base, también los que se agreguen después
    for (const status of Object.values(BookingStatus)) {
      expect([status, canComplete(status)]).toEqual([
        status,
        COMPLETABLE.includes(status),
      ]);
    }
  });

  it('mapsUrl arma el mismo enlace a Google Maps', () => {
    for (const address of [
      'Av. Matta & Lira 100, Ñuñoa',
      'Calle 5 #123, depto 4/B?',
      '  espacios  ',
    ]) {
      expect(frontendMapsUrl(address)).toBe(mapsUrl(address));
    }
  });

  it('whatsappUrl arma el mismo enlace (o ninguno, para un fijo)', () => {
    const cases: [string, string | null][] = [
      ['+56 9 1234 5678', 'https://wa.me/56912345678'],
      ['9 1234 5678', 'https://wa.me/56912345678'],
      ['56912345678', 'https://wa.me/56912345678'],
      ['0056 9 1234 5678', 'https://wa.me/56912345678'],
      ['+54 9 11 1234 5678', 'https://wa.me/5491112345678'],
      ['+1 (415) 555-0100', 'https://wa.me/14155550100'],
      ['22 123 4567', null],
      ['+56 2 2123 4567', null],
      ['+56 41 212 3456', null],
      ['8765 4321', null],
    ];
    for (const [phone, expected] of cases) {
      expect([phone, whatsappUrl(phone)]).toEqual([phone, expected]);
      expect([phone, frontendWhatsappUrl(phone)]).toEqual([phone, expected]);
    }
  });

  describe('dayError del horario y dayHoursError de la API', () => {
    // El panel guarda las horas del almuerzo aunque esté quitado (hasBreak en
    // false); la API recibe null en las dos
    const day = (
      opensAt: string,
      closesAt: string,
      lunch?: [string, string],
    ) => ({
      panel: {
        opensAt,
        closesAt,
        hasBreak: !!lunch,
        breakStartsAt: lunch?.[0] ?? '13:00',
        breakEndsAt: lunch?.[1] ?? '14:00',
      },
      api: {
        weekday: 1,
        opensAt,
        closesAt,
        breakStartsAt: lunch?.[0] ?? null,
        breakEndsAt: lunch?.[1] ?? null,
      },
    });

    it.each([
      ['un día normal', day('09:00', '18:00')],
      ['con almuerzo', day('09:00', '18:00', ['13:00', '14:00'])],
      ['minutos sueltos', day('09:07', '18:03', ['13:01', '13:59'])],
      ['abre al cerrar', day('18:00', '18:00')],
      ['abre después de cerrar', day('19:00', '09:00')],
      ['almuerzo al revés', day('09:00', '18:00', ['14:00', '13:00'])],
      ['almuerzo de cero minutos', day('09:00', '18:00', ['13:00', '13:00'])],
      ['almuerzo justo al abrir', day('09:00', '18:00', ['09:00', '10:00'])],
      ['almuerzo justo al cerrar', day('09:00', '18:00', ['17:00', '18:00'])],
      ['almuerzo antes de abrir', day('09:00', '18:00', ['08:00', '10:00'])],
      ['almuerzo después de cerrar', day('09:00', '18:00', ['17:30', '19:00'])],
    ])('%s: los dos dicen lo mismo', (_, { panel, api }) => {
      const fromApi = dayHoursError(api);
      // El panel lo muestra a continuación del día ("Lunes: la hora...")
      const expected = fromApi && fromApi[0].toLowerCase() + fromApi.slice(1);
      expect(dayError(panel)).toBe(expected);
    });
  });
});
