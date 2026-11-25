import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { CONTACT_EMAIL, OPERATOR_NAME } from '@/lib/contact';

export const metadata = { title: 'Términos de uso' };

export default function TermsPage() {
  return (
    <LegalPage title="Términos de uso" updated="23 de noviembre de 2026">
      <p>
        Reservahoy es operado por {OPERATOR_NAME}, persona natural (en estos
        términos, &quot;Reservahoy&quot;). Al usar Reservahoy aceptas estos
        términos. Si no estás de acuerdo, no uses el servicio.
      </p>

      <h2>El servicio</h2>
      <p>
        Reservahoy ofrece herramientas para que negocios publiquen su
        disponibilidad y reciban reservas online. El servicio está en una etapa
        temprana y se entrega &quot;tal cual&quot;, sin garantía de disponibilidad
        continua.
      </p>

      <h2>Cuentas de negocio</h2>
      <ul>
        <li>Debes entregar información verdadera y mantener segura tu contraseña.</li>
        <li>Eres responsable de la actividad de tu cuenta y de tu equipo.</li>
        <li>
          Eres responsable del trato de los datos de tus clientes y de informarles
          cómo los usas.
        </li>
      </ul>

      <h2>Datos de tus clientes: Reservahoy como encargado</h2>
      <p>
        Al crear una cuenta de negocio, encargas a Reservahoy el tratamiento de
        los datos personales de tus clientes y de tu equipo para prestarte el
        servicio. Respecto de esos datos, tu negocio es el responsable y
        Reservahoy, el encargado. Este encargo se rige por lo siguiente:
      </p>
      <ul>
        <li>
          <strong>Objeto y finalidad:</strong> recibir, guardar y mostrar
          reservas, enviar los correos del servicio (confirmaciones, avisos,
          cancelaciones, &quot;servicio listo&quot;) y mantener la plataforma
          segura. Reservahoy trata los datos solo para eso y según tus
          instrucciones, que son las que das al usar el panel. No los usa para
          fines propios, no los vende ni los comparte con terceros fuera de lo
          que se indica aquí.
        </li>
        <li>
          <strong>Datos y personas:</strong> nombre, correo, teléfono, notas y
          reservas de tus clientes, las fotos que adjuntes al avisar que un
          servicio está listo, y los datos de los miembros de tu equipo.
        </li>
        <li>
          <strong>Duración:</strong> mientras tu cuenta esté activa. Al cerrarla,
          Reservahoy borra esos datos dentro de 30 días, y desaparecen de los
          respaldos cifrados en 30 días más. Si antes de cerrarla pides una
          copia, te la entregamos en un formato de uso común.
        </li>
        <li>
          <strong>Confidencialidad y seguridad:</strong> solo acceden a los datos
          quienes lo necesitan para operar el servicio, con deber de reserva.
          Se aplican medidas como conexiones cifradas, contraseñas guardadas con
          cifrado irreversible, respaldos cifrados y separación entre negocios.
        </li>
        <li>
          <strong>Proveedores (subencargados):</strong> autorizas a Reservahoy
          a usar los proveedores listados en la{' '}
          <Link href="/privacidad">política de privacidad</Link>, que pueden
          operar fuera de Chile. Si se suma un proveedor que reciba datos de tus
          clientes, te avisaremos por correo antes, y podrás cerrar tu cuenta si
          no estás de acuerdo.
        </li>
        <li>
          <strong>Derechos de tus clientes:</strong> si un cliente nos pide
          acceder, rectificar o suprimir sus datos, te lo haremos llegar y te
          ayudaremos a responder.
        </li>
        <li>
          <strong>Incidentes:</strong> si ocurre un incidente de seguridad que
          afecte datos de tus clientes, te avisaremos sin demora indebida con la
          información que tengamos, para que puedas cumplir tus obligaciones.
        </li>
        <li>
          <strong>Tus obligaciones:</strong> informar a tus clientes cómo usas
          sus datos (la página de reservas enlaza a la política de privacidad),
          usarlos solo para fines legítimos y no pedir ni anotar datos
          sensibles, como datos de salud, salvo que sean necesarios para la
          atención.
        </li>
      </ul>

      <h2>Reservas</h2>
      <p>
        Las reservas son un acuerdo entre el cliente y el negocio. Reservahoy
        no garantiza que el servicio se preste ni gestiona pagos entre ellos.
        Cada negocio define sus propias políticas de atención y cancelación.
      </p>

      <h2>Uso aceptable</h2>
      <p>
        No está permitido usar el servicio para enviar correo no solicitado,
        suplantar a otras personas, intentar vulnerar la plataforma o afectar su
        funcionamiento.
      </p>

      <h2>Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, Reservahoy no responde por pérdidas
        derivadas de interrupciones del servicio, reservas no atendidas o errores
        de terceros.
      </p>

      <h2>Terminación</h2>
      <p>
        Puedes dejar de usar el servicio cuando quieras y pedir que se cierre tu
        cuenta escribiendo a{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>; los datos se
        borran en los plazos indicados arriba. Podemos suspender cuentas que
        incumplan estos términos.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República de Chile.</p>

      <h2>Contacto</h2>
      <p>
        Para consultas: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
