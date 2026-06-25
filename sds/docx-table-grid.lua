-- Assign a Word table style that actually defines tblBorders in the reference .docx.
-- Requires Pandoc ≥ 3.9 (custom-style on native Table).
--
-- The WatchMate reference defines "Table Grid" (TableGrid) with *no* borders—only
-- margins—so tables looked borderless. "Grid Table 1 Light" (styleId GridTable1Light)
-- includes full inside/outside single lines and renders a clear grid in Word.
local TABLE_STYLE = "GridTable1Light"

function Table(tbl)
  local a = tbl.attr
  local attrs = {}
  for k, v in pairs(a.attributes) do
    attrs[k] = v
  end
  attrs["custom-style"] = TABLE_STYLE
  tbl.attr = pandoc.Attr(a.identifier, a.classes, attrs)
  return tbl
end
