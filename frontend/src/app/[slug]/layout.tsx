import type { Metadata } from "next";

// La página es de cliente y no puede exportar metadata: el título con el
// nombre del negocio (pestaña del navegador y vista previa al compartir el
// enlace, ej. por WhatsApp) se arma acá, en el servidor
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(
      `${process.env.API_URL ?? "http://localhost:3000"}/public/${encodeURIComponent(slug)}`,
      // si el backend tarda, la página sale con el título por defecto
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return {};
    const { name } = (await res.json()) as { name: string };
    const description = `Reserva tu hora en ${name}.`;
    return {
      title: name, // con la plantilla del layout raíz: "Peluquería Demo · Reservahoy"
      description,
      openGraph: { title: name, description },
    };
  } catch {
    return {};
  }
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
