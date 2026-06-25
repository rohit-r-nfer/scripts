-- Indented paragraphs (tab or 4+ spaces) are parsed as CodeBlock → Word applies a
-- monospace / “Source Code” character style. SDS Implementation Details is often
-- pasted with leading indentation; that is almost always prose, not code.
--
-- Fenced blocks keep their language class (e.g. ```typescript```); only blocks with
-- no identifier and no classes are treated as accidental indented code and rendered
-- as normal body paragraphs (same font as the rest of the document).
function CodeBlock(cb)
  if cb.attr.identifier ~= "" or #cb.attr.classes > 0 then
    return nil
  end
  local inlines = {}
  local first = true
  for line in (cb.text .. "\n"):gmatch("([^\n]*)\n") do
    if not first then
      table.insert(inlines, pandoc.SoftBreak())
    end
    first = false
    table.insert(inlines, pandoc.Str(line))
  end
  return pandoc.Para(inlines)
end
