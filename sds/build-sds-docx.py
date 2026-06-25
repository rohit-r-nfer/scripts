#!/usr/bin/env python3
"""Convert SDS UI Markdown to Word (.docx) via Pandoc.

The WatchMate style reference must sit **next to this script**:

  ~/Projects/scripts/sds/pandoc-reference-watchmate-sds.docx

Example (run from anywhere; pass absolute or relative path to the .md file):

  python3 ~/Projects/scripts/sds/build-sds-docx.py ~/Projects/tee-laac-ui/docs/sds/ui-components-roi.md
  python3 ~/Projects/scripts/sds/build-sds-docx.py docs/sds/foo.md -o /tmp/out.docx

Converts ```text tab tables to pipe tables, normalizes **Software Requirements** shall
lines to **`•`** circle bullets with blank lines between them (not `-` lists), then runs Pandoc with
``-f markdown+pipe_tables+yaml_metadata_block-auto_identifiers``, ``--reference-doc``,
and a Lua filter that sets each native table’s Word ``tblStyle`` to **GridTable1Light**
(**Grid Table 1 Light** in the Styles gallery)—the reference’s **Table Grid** style
has no border definitions, so that name was not enough for a visible grid. A second
Lua filter turns **indented-only** code blocks (tab / four-space paragraphs, no fence
language) into normal paragraphs so **Implementation Details** does not pick up a
monospace font. Body text size follows the reference **.docx** (11 pt). After Pandoc, every
``w:rFonts`` run in the package is rewritten to explicit **Calibri** (ascii / hAnsi / eastAsia /
cs) and theme ``typeface`` values under ``word/theme`` are set to **Calibri** so nothing falls
back to Cambria, Times New Roman, or theme-linked faces. Pandoc cwd is the **source .md’s
directory** so relative paths resolve like a normal repo build.
"""

from __future__ import annotations

import argparse
import io
import re
import subprocess
import sys
import zipfile
from pathlib import Path

# OOXML: explicit Calibri on every run font slot; Pandoc / reference styles often mix Arial,
# TNR, or theme-based asciiTheme / minorHAnsi.
_RFONTS_CALIBRI = (
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>'
)
_RFONTS_SELF_CLOSING = re.compile(r"<w:rFonts\b[^>]*/>", re.IGNORECASE)
_RFONTS_EMPTY_PAIR = re.compile(
    r"<w:rFonts\b[^>]*>\s*</w:rFonts>", re.IGNORECASE | re.DOTALL
)
_THEME_TYPEFACE = re.compile(r'typeface="[^"]*"')


def _patch_wordprocessing_rfonts(data: bytes) -> bytes:
    if b"rFonts" not in data:
        return data
    text = data.decode("utf-8")
    text = _RFONTS_EMPTY_PAIR.sub(_RFONTS_CALIBRI, text)
    text = _RFONTS_SELF_CLOSING.sub(_RFONTS_CALIBRI, text)
    return text.encode("utf-8")


def _patch_theme_typefaces(data: bytes) -> bytes:
    if b"typeface" not in data:
        return data
    text = data.decode("utf-8")
    text = _THEME_TYPEFACE.sub('typeface="Calibri"', text)
    return text.encode("utf-8")


def force_calibri_docx(docx_path: Path) -> None:
    """Rewrite OOXML font hints so runs resolve to Calibri (no theme-only fallbacks)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(docx_path, "r") as zin, zipfile.ZipFile(
        buf, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            payload = zin.read(info.filename)
            if info.filename.startswith("word/") and info.filename.endswith(".xml"):
                payload = _patch_wordprocessing_rfonts(payload)
            elif info.filename.startswith("word/theme/") and info.filename.endswith(".xml"):
                payload = _patch_theme_typefaces(payload)
            zout.writestr(info, payload)
    docx_path.write_bytes(buf.getvalue())


def esc_cell(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\\", "\\\\").replace("|", "\\|")
    return s.replace("\n", " ")


def tab_block_to_markdown_table(lines: list[str]) -> str:
    lines = [ln for ln in lines if ln.strip()]
    if len(lines) < 2:
        return "\n".join(lines) + "\n\n"
    title = lines[0].strip()
    headers = lines[1].split("\t")
    rows = []
    for raw in lines[2:]:
        parts = raw.split("\t", len(headers) - 1)
        if len(parts) < len(headers):
            parts = parts + [""] * (len(headers) - len(parts))
        rows.append(parts[: len(headers)])
    out: list[str] = [f"**{title}**\n"]
    out.append("| " + " | ".join(esc_cell(h) for h in headers) + " |")
    out.append("|" + "|".join(["---"] * len(headers)) + "|")
    for r in rows:
        out.append("| " + " | ".join(esc_cell(c) for c in r) + " |")
    return "\n".join(out) + "\n\n"


def fenced_tables_to_pipe(md: str) -> str:
    pattern = re.compile(r"```text\n(.*?)```", re.DOTALL)

    def repl(m: re.Match[str]) -> str:
        inner = m.group(1).strip("\n")
        return tab_block_to_markdown_table(inner.splitlines())

    md = pattern.sub(repl, md)
    md = re.sub(
        r"\nGoogle Docs: select header \+ data rows → Insert → Table → Convert text to table → Tabs\.\n",
        "\n",
        md,
    )
    return md


_SW_REQ_HEADING = re.compile(r"^\*\*Software Requirements:\*\*\s*$", re.MULTILINE)
_SECTION_HEADING = re.compile(r"^\*\*[^*]+:\*\*\s*$")
_SHALL_HYPHEN = re.compile(
    r"^- (The software shall|It shall|TBD —)",
    re.IGNORECASE,
)


def normalize_software_requirements_bullets(md: str) -> str:
    """Under **Software Requirements:**, use circle bullets (•) and blank lines between shalls."""

    lines = md.splitlines()
    out: list[str] = []
    in_sw_req = False
    first_bullet_in_section = True

    for line in lines:
        if _SW_REQ_HEADING.match(line):
            in_sw_req = True
            first_bullet_in_section = True
            out.append(line)
            continue

        if in_sw_req and _SECTION_HEADING.match(line):
            in_sw_req = False
            first_bullet_in_section = True

        if in_sw_req:
            if _SHALL_HYPHEN.match(line):
                bullet = "• " + line[2:].lstrip()
                if not first_bullet_in_section and out and out[-1].strip():
                    out.append("")
                first_bullet_in_section = False
                out.append(bullet)
                continue
            if line.lstrip().startswith("•"):
                if not first_bullet_in_section and out and out[-1].strip():
                    out.append("")
                first_bullet_in_section = False
                out.append(line)
                continue

        out.append(line)

    trailing_nl = "\n" if md.endswith("\n") else ""
    return "\n".join(out) + trailing_nl


def default_title_from_stem(stem: str) -> str:
    return " ".join(part.capitalize() for part in stem.replace("_", "-").split("-") if part)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert a Markdown SDS excerpt to .docx using Pandoc and the WatchMate reference.docx.",
    )
    parser.add_argument(
        "markdown",
        type=Path,
        help="Path to the source .md file (relative to current working directory is ok).",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output .docx path (default: same directory as the .md, same basename, .docx).",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    ref = script_dir / "pandoc-reference-watchmate-sds.docx"
    if not ref.is_file():
        print(
            f"Missing reference Word file next to this script:\n  {ref}\n"
            "Place pandoc-reference-watchmate-sds.docx in that folder (WatchMate SDS styles).",
            file=sys.stderr,
        )
        return 1

    src = args.markdown.expanduser().resolve()
    if not src.is_file():
        print(f"Not found or not a file: {src}", file=sys.stderr)
        return 1
    if src.suffix.lower() != ".md":
        print("Expected a .md file.", file=sys.stderr)
        return 1

    out = args.output.expanduser().resolve() if args.output else src.with_suffix(".docx")
    out.parent.mkdir(parents=True, exist_ok=True)

    build_dir = script_dir / ".pandoc-build"
    build_dir.mkdir(parents=True, exist_ok=True)
    intermediate = build_dir / f"{src.stem}-pandoc-input.md"

    body = src.read_text(encoding="utf-8")
    body = fenced_tables_to_pipe(body)
    body = normalize_software_requirements_bullets(body)

    if body.lstrip().startswith("---"):
        intermediate_body = body
    else:
        title = default_title_from_stem(src.stem)
        yaml = f'---\ntitle: "{title}"\nlang: en-US\n---\n\n'
        intermediate_body = yaml + body

    intermediate.write_text(intermediate_body, encoding="utf-8")

    lua_table = script_dir / "docx-table-grid.lua"
    lua_body = script_dir / "docx-indented-code-as-body.lua"
    if not lua_table.is_file():
        print(f"Missing Lua filter next to this script:\n  {lua_table}", file=sys.stderr)
        return 1
    if not lua_body.is_file():
        print(f"Missing Lua filter next to this script:\n  {lua_body}", file=sys.stderr)
        return 1

    cmd = [
        "pandoc",
        str(intermediate),
        "-f",
        "markdown+pipe_tables+yaml_metadata_block-auto_identifiers",
        "-t",
        "docx",
        "-o",
        str(out),
        "--standalone",
        "--reference-doc",
        str(ref),
        "--lua-filter",
        str(lua_body),
        "--lua-filter",
        str(lua_table),
    ]
    pandoc_cwd = src.parent
    print("reference-doc:", ref, file=sys.stderr)
    print("pandoc cwd:", pandoc_cwd, file=sys.stderr)
    print("Running:", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True, cwd=str(pandoc_cwd))
    force_calibri_docx(out)
    print("Wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
