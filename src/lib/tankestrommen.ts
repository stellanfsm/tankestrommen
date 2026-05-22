const API_BASE = "https://tankestrommen.vercel.app";

export type TankestromEvent = {
  proposalId: string;
  title: string;
  date: string;
  start: string;
  end: string;
  notes: string;
  location: string;
  confidence: number;
  personId: string;
};

export type TankestromResult = {
  items: TankestromEvent[];
  ok: boolean;
};

type RawItem = {
  kind: string;
  proposalId: string;
  confidence?: number;
  event: {
    title: string;
    date: string;
    start: string;
    end: string;
    notes: string;
    location: string;
    personId: string;
  };
};

type RawResponse = {
  ok: boolean;
  items: RawItem[];
};

function mapItems(raw: RawResponse): TankestromEvent[] {
  return raw.items
    .filter((item) => item.kind === "event")
    .map((item) => ({
      proposalId: item.proposalId,
      confidence: item.confidence ?? 1,
      ...item.event,
    }));
}

export async function analyzeImage(imageBase64: string): Promise<TankestromResult> {
  try {
    const b64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const byteString = atob(b64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const form = new FormData();
    form.append("file", blob, "image.jpg");

    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: form,
    });

    const raw: RawResponse = await res.json();
    return { ok: raw.ok, items: mapItems(raw) };
  } catch {
    return { ok: false, items: [] };
  }
}

export async function analyzeText(text: string): Promise<TankestromResult> {
  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const raw: RawResponse = await res.json();
    return { ok: raw.ok, items: mapItems(raw) };
  } catch {
    return { ok: false, items: [] };
  }
}
