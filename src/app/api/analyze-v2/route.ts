import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/ai/analyze-image";
import {
  getImageInitialAnalysisModel,
  getStrongAnalysisModel,
} from "@/lib/ai/analysis-model-router";

const TEXT_SYSTEM_PROMPT_V2 = `Du analyserer tekst fra beskjeder, invitasjoner, ukeplaner og dokumenter for norske foreldre.
Les all teksten og ekstraher alle hendelser og gjøremål.

Svar med ETT JSON-objekt (ingen markdown-kodeblokker) med nøyaktig dette skjemaet:

{
  "version": "2.0.0",
  "items": [ ... ]
}

Hvert element i "items" er ENTEN en hendelse (kind="event") ELLER et gjøremål (kind="task").

─── HENDELSE (kind="event") ───
Bruk "event" når innholdet har et definert tidsvindu (dato + eventuelt klokkeslett) der noe skjer.

{
  "kind": "event",
  "title": "string — kun hendelsens eget navn, aldri dokumentoverskrift",
  "date": "YYYY-MM-DD",
  "start": "HH:mm eller null",
  "end": "HH:mm eller null",
  "location": "string eller null",
  "notes": "string — kun info spesifikk for denne hendelsen (sted, pris, hva som trengs). Null hvis ingen spesifikk info.",
  "personHints": {
    "names": ["liste med navn nevnt i dokumentet"],
    "class": "klassetrinn eller null",
    "school": "skolenavn eller null",
    "targetGroup": "barn | foreldre | familie | null"
  },
  "recurrence": "daily | weekly | monthly | null",
  "transport": {
    "needed": true,
    "hints": ["liste med hint fra dokumentet"]
  }
}

─── GJØREMÅL (kind="task") ───
Bruk "task" når innholdet er en handling/frist som må gjøres, men som ikke er en tidsblokkert hendelse.

{
  "kind": "task",
  "title": "string",
  "date": "YYYY-MM-DD",
  "dueTime": "HH:mm eller null",
  "notes": "string eller null",
  "personHints": {
    "names": [],
    "class": null,
    "school": null,
    "targetGroup": "barn | foreldre | null"
  },
  "taskIntent": "must_do | can_help"
}

─── REGLER ───
1. start og end skal ALLTID være HH:mm-format, aldri ISO datetime.
2. title skal være hendelsens spesifikke navn — aldri dokumentoverskriften.
3. notes skal kun inneholde informasjon som er spesifikk for akkurat den ene hendelsen/oppgaven.
4. Hvis et dokument beskriver flere hendelser eller gjøremål, lag ett item per hendelse/gjøremål.
5. Avgjør kind ut fra om elementet har et tidsvindu (event) eller er en handling/frist (task).
6. targetGroup: bruk "barn" for skoleaktiviteter rettet mot elever, "foreldre" for foreldremøter o.l., "familie" for aktiviteter der hele familien deltar.
7. transport.needed: sett true hvis dokumentet antyder at barn må leveres/hentes eller at transport er nødvendig.
8. Dato-regel for ukeplaner: hvis kilden har uke-nummer (f.eks. "Uke 13") og ukedager, beregn eksakt dato med ISO-uke (mandag = dag 1 i uken; uke 1 = uken med årets første torsdag). Bruk årstall fra kilden, eller inneværende år hvis mangler.
9. Hvis teksten ikke inneholder meningsfull informasjon, returner { "version": "2.0.0", "items": [] }.`;

interface ParsedBody {
  image?: string;
  text?: string;
  pdf?: string;
  docx?: string;
  fileName?: string;
}

function isMultipart(request: NextRequest): boolean {
  return (request.headers.get("content-type") ?? "").includes("multipart/form-data");
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
}

async function parseMultipartBody(request: NextRequest): Promise<ParsedBody> {
  const form = await request.formData();
  const file = form.get("file") as File | null;
  const textField = form.get("text") as string | null;

  if (textField && typeof textField === "string") {
    return { text: textField };
  }

  if (!file) return {};

  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  const dataUrl = await fileToDataUrl(file);

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return { pdf: dataUrl, fileName: file.name };
  }
  if (name.endsWith(".docx") || mime.includes("wordprocessingml.document")) {
    return { docx: dataUrl, fileName: file.name };
  }
  if (mime.startsWith("image/")) {
    return { image: dataUrl, fileName: file.name };
  }
  return { pdf: dataUrl, fileName: file.name };
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY er ikke satt i miljøvariabler");
  return new OpenAI({ apiKey });
}

function outputTokenParam(
  model: string,
  max: number,
): { max_tokens: number } | { max_completion_tokens: number } {
  const m = model.trim().toLowerCase();
  if (m.includes("gpt-5") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
    return { max_completion_tokens: max };
  }
  return { max_tokens: max };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, "base64");
}

async function callForImage(imageBase64: string): Promise<unknown> {
  const openai = getOpenAIClient();
  const model = getImageInitialAnalysisModel();
  const url = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyser bildet og returner JSON som beskrevet." },
          { type: "image_url", image_url: { url, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    ...outputTokenParam(model, 2800),
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Tom respons fra modellen");
  return JSON.parse(raw) as unknown;
}

async function callForText(text: string): Promise<unknown> {
  const openai = getOpenAIClient();
  const model = getStrongAnalysisModel();

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: TEXT_SYSTEM_PROMPT_V2 },
      {
        role: "user",
        content: `Analyser følgende tekst og returner JSON som beskrevet:\n\n${text}`,
      },
    ],
    response_format: { type: "json_object" },
    ...outputTokenParam(model, 4000),
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Tom respons fra modellen");
  return JSON.parse(raw) as unknown;
}

async function resolveTextFromBody(body: ParsedBody): Promise<string | null> {
  if (body.text && typeof body.text === "string" && body.text.trim()) {
    return body.text.trim();
  }

  if (body.pdf && typeof body.pdf === "string") {
    const buffer = dataUrlToBuffer(body.pdf);
    const { extractTextFromPdfBuffer } = await import("@/lib/pdf/extract-pdf-text");
    const { text } = await extractTextFromPdfBuffer(buffer);
    return text?.trim() || null;
  }

  if (body.docx && typeof body.docx === "string") {
    const buffer = dataUrlToBuffer(body.docx);
    const { extractTextFromDocxBuffer } = await import("@/lib/docx/extract-docx-text");
    return (await extractTextFromDocxBuffer(buffer))?.trim() || null;
  }

  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Analyse-tjenesten er ikke konfigurert (mangler OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  let body: ParsedBody;
  try {
    body = isMultipart(request)
      ? await parseMultipartBody(request)
      : ((await request.json()) as ParsedBody);
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  try {
    if (body.image && typeof body.image === "string") {
      const result = await callForImage(body.image);
      return NextResponse.json(result, { status: 200 });
    }

    const text = await resolveTextFromBody(body);
    if (text) {
      if (text.length > 15_000) {
        return NextResponse.json(
          { error: "Teksten er for lang. Maks 15 000 tegn." },
          { status: 413 },
        );
      }
      const result = await callForText(text);
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(
      { error: "Ingen gjenkjennelig input (image, text, pdf eller docx)." },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukjent feil";
    console.error("[api/analyze-v2]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
