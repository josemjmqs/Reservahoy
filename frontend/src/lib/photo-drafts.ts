// Borradores de las fotos del aviso de "servicio listo": las que se eligen en
// el diálogo de Completada quedan guardadas en este navegador (IndexedDB), por
// reserva, hasta que se envían. Así se puede sumar una foto, salir y volver
// más tarde por otra. No salen del dispositivo hasta enviarlas, se guardan ya
// reducidas (~150 KB) y se borran al enviar, a los 7 días, cuando la reserva
// deja de estar activa y al cerrar la sesión (pueden ser cosas de clientes en
// un equipo compartido).
//
// Todo es "mejor esfuerzo": si IndexedDB no está (modo privado, sin espacio)
// o falla, se responde como si no hubiera borradores y nunca se lanza, así el
// diálogo funciona igual que sin borradores

const DB_NAME = "reservahoy";
const STORE = "photo-drafts";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Draft {
  bookingId: string;
  photos: Blob[];
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: "bookingId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Corre `work` en una transacción y resuelve cuando termina (o falla)
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const fresh = (d: Draft | undefined, now = Date.now()) =>
  !!d && now - d.updatedAt < MAX_AGE_MS && d.photos.length > 0;

export async function getDraft(bookingId: string): Promise<Blob[]> {
  try {
    const draft = await withStore<Draft>("readonly", (s) => s.get(bookingId));
    return fresh(draft) ? draft!.photos : [];
  } catch {
    return [];
  }
}

// Sin fotos, el borrador se borra
export async function saveDraft(bookingId: string, photos: Blob[]) {
  try {
    await withStore("readwrite", (s) => {
      if (photos.length) {
        s.put({ bookingId, photos, updatedAt: Date.now() } satisfies Draft);
      } else {
        s.delete(bookingId);
      }
    });
  } catch {
    // sin borrador: al volver, el diálogo aparece vacío (como antes)
  }
}

export const deleteDraft = (bookingId: string) => saveDraft(bookingId, []);

// Cuántas fotos guardadas tiene cada reserva activa de la lista (para el
// aviso en la agenda). De paso borra los borradores vencidos y los de
// reservas de la lista que ya no están activas (completadas o canceladas,
// también desde otro dispositivo)
export async function syncDrafts(
  bookings: { id: string; status: string }[],
): Promise<Record<string, number>> {
  try {
    const drafts = (await withStore<Draft[]>("readonly", (s) => s.getAll())) ?? [];
    const status = new Map(bookings.map((b) => [b.id, b.status]));
    const active = (id: string) =>
      status.get(id) === "PENDING" || status.get(id) === "CONFIRMED";
    const now = Date.now();
    const stale = drafts.filter(
      (d) => !fresh(d, now) || (status.has(d.bookingId) && !active(d.bookingId)),
    );
    if (stale.length) {
      await withStore("readwrite", (s) => {
        for (const d of stale) s.delete(d.bookingId);
      });
    }
    const counts: Record<string, number> = {};
    for (const d of drafts) {
      if (active(d.bookingId) && fresh(d, now)) {
        counts[d.bookingId] = d.photos.length;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

// Al cerrar la sesión (o si se venció o se quitó el acceso)
export async function clearDrafts() {
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch {
    // nada que borrar
  }
}
