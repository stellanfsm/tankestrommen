import os
import io
import json
import base64
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from PIL import Image, ImageEnhance

env_path = Path(__file__).parent / ".env.local"
load_dotenv(env_path)

app = Flask(__name__)

VISION_MODEL = "gpt-4o-mini"

VALID_CATEGORIES = [
    "arrangement", "frist", "beskjed", "trening", "møte", "annet"
]

IMAGE_MAX_SIDE = 1024
CONTRAST_FACTOR = 1.4


def build_system_prompt() -> str:
    today = date.today().isoformat()
    return (
        f"Dagens dato er {today}.\n\n"
        "Du analyserer bilder av beskjeder, invitasjoner, skjermbilder og dokumenter for norske foreldre.\n"
        "Les all synlig tekst. Avgjør om innholdet beskriver ett eller flere arrangementer, frister, beskjeder, "
        "treninger, møter eller annet.\n\n"
        "Svar med ETT JSON-objekt (ingen markdown-kodeblokker) med nøyaktig denne strukturen:\n"
        '{"events": [...]}\n\n'
        "Hvert element i listen skal ha disse nøklene:\n"
        "- title: kort tittel på norsk (string)\n"
        "- date: dato i ISO 8601-format YYYY-MM-DD hvis funnet, ellers null (string | null)\n"
        "- startTime: starttid som HH:MM hvis funnet, ellers null (string | null)\n"
        "- endTime: sluttid som HH:MM hvis funnet, ellers null (string | null)\n"
        "- attendanceTime: oppmøtetid som HH:MM hvis funnet, ellers null (string | null)\n"
        "- location: sted hvis funnet, ellers null (string | null)\n"
        "- category: én av: arrangement, frist, beskjed, trening, møte, annet\n"
        "- targetGroup: hvem det gjelder (f.eks. klasse, lag, foreldre), ellers null (string | null)\n"
        "- description: kort oppsummering på norsk (string)\n"
        "- isTentative: true hvis datoen/tidspunktet er usikkert eller foreløpig (bool)\n"
        "- tentativeReason: årsak til usikkerhet hvis isTentative er true, ellers null (string | null)\n"
        "- bringItems: liste over ting man skal ta med, f.eks. [\"matpakke\", \"regntøy\"] (string[])\n"
        "- highlights: viktige punkter eller merknader fra teksten (string[])\n"
        "- requiresManualReview: true hvis bildet er uklart eller tolkningen er usikker (bool)\n\n"
        "Alle datoer SKAL være i ISO 8601-format (YYYY-MM-DD). Bruk dagens dato som referanse for "
        "relative uttrykk som «neste uke», «i morgen» osv.\n\n"
        "Hvis bildet ikke inneholder lesbar tekst, returner {\"events\": []} og sett ingen elementer."
    )


def parse_category(value):
    if isinstance(value, str) and value in VALID_CATEGORIES:
        return value
    return "annet"


def compute_confidence(event: dict) -> float:
    score = 0.0
    max_score = 0.0

    field_weights = {
        "title": 15,
        "date": 20,
        "startTime": 10,
        "endTime": 5,
        "attendanceTime": 5,
        "location": 10,
        "category": 5,
        "targetGroup": 5,
        "description": 15,
        "bringItems": 5,
        "highlights": 5,
    }

    for field, weight in field_weights.items():
        max_score += weight
        value = event.get(field)
        if value is None:
            continue
        if isinstance(value, str) and value.strip():
            score += weight
        elif isinstance(value, list) and len(value) > 0:
            score += weight

    if max_score == 0:
        return 0.0
    return round(score / max_score, 2)


def normalize_event(data: dict) -> dict:
    if not isinstance(data, dict):
        return None

    def str_or_none(key):
        val = data.get(key)
        return str(val) if val is not None else None

    bring = data.get("bringItems", [])
    if not isinstance(bring, list):
        bring = []
    bring = [str(item) for item in bring if item is not None]

    highlights = data.get("highlights", [])
    if not isinstance(highlights, list):
        highlights = []
    highlights = [str(item) for item in highlights if item is not None]

    event = {
        "title": data.get("title", "Uten tittel") if isinstance(data.get("title"), str) else "Uten tittel",
        "date": str_or_none("date"),
        "startTime": str_or_none("startTime"),
        "endTime": str_or_none("endTime"),
        "attendanceTime": str_or_none("attendanceTime"),
        "location": str_or_none("location"),
        "category": parse_category(data.get("category")),
        "targetGroup": str_or_none("targetGroup"),
        "description": (
            data.get("description", "Ingen beskrivelse tilgjengelig.")
            if isinstance(data.get("description"), str)
            else "Ingen beskrivelse tilgjengelig."
        ),
        "isTentative": bool(data.get("isTentative", False)),
        "tentativeReason": str_or_none("tentativeReason") if data.get("isTentative") else None,
        "bringItems": bring,
        "highlights": highlights,
        "requiresManualReview": bool(data.get("requiresManualReview", False)),
    }

    event["confidence"] = compute_confidence(event)
    return event


def normalize_result(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ugyldig JSON fra modellen")

    raw_events = data.get("events", [])
    if not isinstance(raw_events, list):
        raw_events = [data]

    events = []
    for item in raw_events:
        normalized = normalize_event(item)
        if normalized is not None:
            events.append(normalized)

    return {"events": events}


def preprocess_image(image_base64: str) -> str:
    if image_base64.startswith("data:"):
        header, encoded = image_base64.split(",", 1)
    else:
        header = None
        encoded = image_base64

    raw_bytes = base64.b64decode(encoded)
    img = Image.open(io.BytesIO(raw_bytes))

    w, h = img.size
    longest = max(w, h)
    if longest > IMAGE_MAX_SIDE:
        scale = IMAGE_MAX_SIDE / longest
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(CONTRAST_FACTOR)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    processed_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return f"data:image/jpeg;base64,{processed_b64}"


def analyze_image(image_base64: str) -> dict:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY er ikke satt i .env.local")

    client = OpenAI(api_key=api_key)
    image_url = preprocess_image(image_base64)
    system_prompt = build_system_prompt()

    completion = client.chat.completions.create(
        model=VISION_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Analyser bildet og returner JSON som beskrevet."},
                    {"type": "image_url", "image_url": {"url": image_url, "detail": "high"}},
                ],
            },
        ],
        response_format={"type": "json_object"},
        max_tokens=4000,
        temperature=0,
    )

    content = completion.choices[0].message.content
    if not content:
        raise RuntimeError("Tom respons fra OpenAI")

    parsed = json.loads(content)
    return normalize_result(parsed)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    try:
        body = request.get_json(force=True)
        image = body.get("image")

        if not image:
            return jsonify({"error": "Mangler bilde i request body"}), 400

        result = analyze_image(image)
        return jsonify(result)

    except Exception as e:
        print(f"[api/analyze] {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
