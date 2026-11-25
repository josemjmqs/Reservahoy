import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { CONTACT_EMAIL, OPERATOR_NAME } from '@/lib/contact';

export const metadata = { title: 'Política de privacidad' };

export default function PrivacyPage() {
  const contact = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <LegalPage title="Política de privacidad" updated="23 de noviembre de 2026">
      <p>
        Reservahoy es una plataforma que permite a negocios recibir reservas
        online. Esta política explica qué datos personales se tratan, para qué,
        quién los recibe, cuánto tiempo se guardan y cómo ejercer tus derechos,
        conforme a la Ley N° 19.628 sobre protección de la vida privada,
        modificada por la Ley N° 21.719.
      </p>

      <h2>Quién está detrás de Reservahoy</h2>
      <p>
        Reservahoy es operado por {OPERATOR_NAME}, persona natural. Contacto
        para todo lo relacionado con datos personales:{' '}
        {contact}.
      </p>

      <h2>Quién decide sobre tus datos</h2>
      <ul>
        <li>
          <strong>Si reservaste en un negocio:</strong> el negocio es el
          responsable de tus datos y decide para qué los usa. Reservahoy los
          trata solo por cuenta e instrucción del negocio, como encargado, para
          prestarle el servicio de reservas, y no los usa para fines propios.
        </li>
        <li>
          <strong>Si tienes una cuenta de negocio o eres parte de su equipo, o
          nos escribes:</strong> Reservahoy es el responsable de esos datos.
        </li>
      </ul>

      <h2>Datos que tratamos</h2>
      <ul>
        <li>
          <strong>Clientes que reservan:</strong> nombre, correo, teléfono
          (opcional), notas que escribas al reservar (opcional) y los datos de
          la reserva (servicios, profesional, día, hora y estado). Si el negocio
          te avisa que tu servicio está listo, el correo puede incluir fotos que
          el negocio adjunta; esas fotos se envían y no se guardan en
          Reservahoy.
        </li>
        <li>
          <strong>Negocios y su equipo:</strong> nombre, correo, contraseña
          (guardada con un cifrado irreversible), el nombre con que cada
          profesional aparece en la página pública, sus horarios y bloqueos, y
          los datos del negocio: nombre, teléfono, dirección, color, logo y
          fotos de los servicios. El logo y las fotos de los servicios son
          públicos, porque se muestran en la página del negocio.
        </li>
        <li>
          <strong>Mensajes de ayuda:</strong> cuando alguien del panel nos
          escribe, guardamos su mensaje, el tipo de consulta, la pantalla desde
          donde escribió, el navegador que usaba, y a qué negocio y miembro
          corresponde.
        </li>
        <li>
          <strong>Datos técnicos:</strong> la dirección IP, que se usa para
          limitar abusos y no se guarda en nuestra base de datos, y una cookie
          de sesión para quienes inician sesión.
        </li>
      </ul>
      <p>
        Las notas de una reserva son para lo que el negocio necesita saber de
        antemano. Te pedimos no escribir ahí datos de salud ni otros datos
        sensibles que no sean necesarios para la atención.
      </p>

      <h2>Para qué los usamos y con qué base</h2>
      <ul>
        <li>
          Gestionar, confirmar y cancelar reservas, y avisar al
          negocio y a su equipo: es lo necesario para la reserva que pediste o
          para el servicio que el negocio contrató.
        </li>
        <li>
          Enviar correos de la cuenta (confirmar el correo, recuperar la
          contraseña, invitaciones al equipo) y responder mensajes de ayuda: es
          lo necesario para prestar el servicio.
        </li>
        <li>
          Mantener la seguridad, evitar abusos y detectar errores: es nuestro
          interés legítimo en que la plataforma funcione de forma segura.
        </li>
      </ul>
      <p>
        No vendemos datos, no los usamos para publicidad ni para perfiles, y no
        tomamos decisiones automatizadas sobre las personas.
      </p>

      <h2>Quién los recibe</h2>
      <p>
        Usamos estos proveedores, que tratan datos solo para prestarnos su
        servicio:
      </p>
      <ul>
        <li>Vercel: alojamiento del sitio web.</li>
        <li>Render: servidor de la aplicación.</li>
        <li>Neon: base de datos.</li>
        <li>
          Resend: envío de correos, incluidas las fotos de &quot;servicio
          listo&quot; que el negocio adjunta.
        </li>
        <li>
          Cloudflare: dominio, reenvío del correo de contacto, almacenamiento
          del logo y las fotos de los servicios, y de los respaldos cifrados.
        </li>
        <li>
          Sentry: aviso de errores técnicos. Recibe qué falló y en qué
          pantalla, sin nombres, correos, teléfonos ni enlaces de reservas.
        </li>
      </ul>
      <p>
        Estos proveedores operan fuera de Chile (por ejemplo, en Estados
        Unidos), así que tus datos se transfieren y almacenan en otros países.
        Los elegimos porque ofrecen garantías de seguridad y confidencialidad
        adecuadas. El negocio en el que reservaste también ve tus datos en su
        panel.
      </p>

      <h2>Cookies y almacenamiento en el navegador</h2>
      <p>
        Solo usamos una cookie de sesión necesaria para quienes inician sesión.
        No usamos cookies de seguimiento ni publicidad. En el panel, las fotos
        de &quot;servicio listo&quot; que aún no se envían quedan guardadas solo
        en ese navegador hasta enviarlas, por 7 días como máximo, y se borran al
        cerrar sesión.
      </p>

      <h2>Cuánto tiempo los conservamos</h2>
      <ul>
        <li>
          Mientras la cuenta del negocio esté activa, guardamos sus datos, los
          de su equipo y los de sus clientes y reservas.
        </li>
        <li>
          Si el negocio cierra su cuenta, borramos todo (negocio, equipo,
          clientes, reservas, fotos y mensajes de ayuda) dentro de 30 días.
        </li>
        <li>
          Los respaldos cifrados se borran solos a los 30 días, así que un dato
          borrado desaparece por completo de los respaldos en ese plazo.
        </li>
        <li>
          Los avisos de errores en Sentry y los registros de envío de correos
          en Resend se borran solos según los plazos de cada proveedor.
        </li>
      </ul>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir acceso a tus datos, rectificarlos, suprimirlos, oponerte a
        su tratamiento, pedir que se bloqueen mientras se resuelve una
        solicitud, o recibirlos en un formato que puedas llevar a otro servicio
        (portabilidad).
      </p>
      <ul>
        <li>
          <strong>Si reservaste en un negocio,</strong> pídelo al negocio, que
          es el responsable. También puedes escribirnos a {contact}: le haremos
          llegar tu solicitud y lo ayudaremos a responderla.
        </li>
        <li>
          <strong>Si tienes una cuenta o nos escribiste,</strong> escríbenos a{' '}
          {contact}.
        </li>
      </ul>
      <p>
        Respondemos dentro de 30 días corridos. Si no quedas conforme, puedes
        reclamar ante la Agencia de Protección de Datos Personales.
      </p>

      <h2>Seguridad</h2>
      <p>
        Las conexiones van cifradas, las contraseñas se guardan con un cifrado
        irreversible, los respaldos se cifran y cada negocio solo puede ver sus
        propios datos. Si ocurre un incidente de seguridad que afecte datos
        personales, avisaremos a los negocios afectados y, cuando corresponda,
        a la Agencia de Protección de Datos Personales y a las personas
        afectadas.
      </p>

      <h2>Cambios</h2>
      <p>
        Si actualizamos esta política, cambiaremos la fecha de arriba. Si el
        cambio es importante, como sumar un proveedor que reciba datos de
        clientes, avisaremos por correo a los negocios antes de aplicarlo. Ver
        también los <Link href="/terminos">términos de uso</Link>.
      </p>
    </LegalPage>
  );
}
