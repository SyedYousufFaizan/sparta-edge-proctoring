"""Replace uniquely matched resume passages without adding PDF pages."""
import html
import re
import unicodedata
import pymupdf


def has_placeholder(text: str) -> bool:
    return bool(re.search(r"🔴|\[(?:add|insert|verify|replace|your)\b", text, re.I))


def normalized(text):
    text = unicodedata.normalize("NFKC", text).casefold()
    text = text.translate(str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"'}))
    return "".join(c for c in text if not c.isspace() and c not in "-‐‑‒–—\u00ad")


def page_characters(page):
    characters = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                for char in span["chars"]:
                    characters.append({**char, "line": line, "size": span["size"], "color": span["color"], "block_right": block["bbox"][2]})
    text, positions = "", []
    for offset, char in enumerate(characters):
        char["offset"] = offset
        value = normalized(char["c"])
        text += value
        positions.extend([char] * len(value))
    return text, positions, characters


def replace_resume_bullets(pdf_bytes: bytes, bullets: list[dict]) -> bytes:
    if not bullets or len(bullets) > 20:
        raise ValueError("Select between 1 and 20 bullets to save.")
    for bullet in bullets:
        if not isinstance(bullet, dict) or any(
            not isinstance(bullet.get(key), str) or not bullet[key].strip() or len(bullet[key]) > 5000
            for key in ("original", "enhanced")
        ):
            raise ValueError("Each replacement needs its original and edited text (maximum 5000 characters).")
        if has_placeholder(bullet["enhanced"]):
            raise ValueError("Replace marked placeholders with verified facts before saving.")
    try:
        resume = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as error:
        raise ValueError("The uploaded file is not a readable PDF.") from error
    with resume:
        if resume.needs_pass:
            raise ValueError("Upload a PDF without password protection.")
        if not resume.page_count:
            raise ValueError("The resume PDF has no pages.")
        pages = [page_characters(page) for page in resume]
        replacements = []
        for index, bullet in enumerate(bullets):
            needle = normalized(bullet["original"])
            matches = []
            for page_number, (text, positions, all_characters) in enumerate(pages):
                start = 0
                while needle and (start := text.find(needle, start)) >= 0:
                    first = positions[start]["offset"]
                    last = positions[start + len(needle) - 1]["offset"]
                    matches.append((page_number, all_characters[first:last + 1]))
                    start += 1
            if len(matches) != 1:
                reason = "was not found" if not matches else "matches more than one location"
                raise ValueError(f"Bullet {index + 1} {reason} in the PDF. Deselect it or regenerate its original text.")
            page_number, chars = matches[0]
            lines = {}
            for char in chars:
                line = char["line"]
                if tuple(line["dir"]) != (1.0, 0.0):
                    raise ValueError(f"Bullet {index + 1} uses rotated text that cannot be replaced safely.")
                key = id(line)
                rect = pymupdf.Rect(char["bbox"])
                lines[key] = lines[key] | rect if key in lines else rect
            rectangles = list(lines.values())
            target = pymupdf.Rect(rectangles[0])
            for rect in rectangles[1:]:
                target |= rect
            selected_ids = {id(char) for char in chars}
            for char in pages[page_number][2]:
                box = pymupdf.Rect(char["bbox"])
                if normalized(char["c"]) and box.intersects(target) and id(char) not in selected_ids:
                    raise ValueError(f"Bullet {index + 1} overlaps other text. Select a complete bullet instead.")
            # Use the existing text column's unused width, with a small line-height
            # allowance, only when it does not touch any neighboring text.
            column_right = max(char["bbox"][2] for char in pages[page_number][2])
            expanded = pymupdf.Rect(target.x0, target.y0 - 0.3, max(target.x1, column_right), target.y1 + 1)
            if not any(normalized(char["c"]) and id(char) not in selected_ids and
                       pymupdf.Rect(char["bbox"]).intersects(expanded) for char in pages[page_number][2]):
                target = expanded
            for previous in replacements:
                if previous[0] == page_number and previous[1].intersects(target):
                    raise ValueError("Selected bullets overlap. Select each original bullet only once.")
            size = chars[0]["size"]
            color = f"#{chars[0]['color']:06x}"
            text = bullet["enhanced"].strip().translate(str.maketrans({c: "-" for c in "‐‑‒–—−"}))
            markup = f"<div>{html.escape(text)}</div>"
            css = f"* {{margin:0;padding:0}} div {{font-family:serif;font-size:{size}pt;line-height:1.1;color:{color};}}"
            # Preflight all replacements before redacting any original text.
            with pymupdf.open() as trial:
                page = trial.new_page(width=resume[page_number].rect.width, height=resume[page_number].rect.height)
                spare, scale = page.insert_htmlbox(target, markup, css=css, scale_low=0.85)
                if spare < 0:
                    raise ValueError(f"Bullet {index + 1} is too long for its original space. Shorten it before saving.")
            replacements.append((page_number, target, rectangles, markup, css))
        for page_number in sorted({item[0] for item in replacements}):
            page = resume[page_number]
            items = [item for item in replacements if item[0] == page_number]
            for _, _, rectangles, _, _ in items:
                for rect in rectangles:
                    page.add_redact_annot(rect, fill=False)
            page.apply_redactions(images=0, graphics=0)
            for _, target, _, markup, css in items:
                page.insert_htmlbox(target, markup, css=css, scale_low=0.85)
        return resume.tobytes(garbage=4, deflate=True)
