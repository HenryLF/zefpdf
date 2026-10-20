/**
 * Fixture PDFs, written by hand.
 *
 * Raw rather than printed from a browser: Chromium's print-to-PDF normalises
 * every page to one size, and the reader's whole page-sizing path exists
 * because pages within a document differ. These carry explicit MediaBoxes.
 */

/** A link annotation: to a web address, or to the top of another page. */
type LinkSpec = { rect: [number, number, number, number] } & (
  | { uri: string }
  | { page: number }
);

interface PageSpec {
  width: number;
  height: number;
  text: string;
  links?: LinkSpec[];
}

/** An outline entry pointing at the top of a page, with entries nested under it. */
interface OutlineSpec {
  title: string;
  page: number;
  children?: OutlineSpec[];
}

/** A minimal one-font PDF with a text object per page, so a text layer exists. */
function buildPdf(pages: PageSpec[], outline: OutlineSpec[] = []): Uint8Array {
  const objects: string[] = [];
  /** Object ids are 1-based; objects[i] is object i+1. */
  const add = (body: string) => objects.push(body);

  const pageIds = pages.map((_, i) => 4 + i * 2);
  const contentIds = pages.map((_, i) => 5 + i * 2);
  // The outline comes after the pages: its root, then one object per entry.
  const outlineId = 4 + pages.length * 2;
  const entryId = (i: number) => outlineId + 1 + i;
  /** The top-left corner of a page, as a link or an outline entry names it. */
  const destTo = (page: number) =>
    `[${pageIds[page - 1]} 0 R /XYZ 0 ${pages[page - 1]!.height} null]`;

  add(
    `<< /Type /Catalog /Pages 2 0 R` +
      (outline.length ? ` /Outlines ${outlineId} 0 R` : "") +
      ` >>`,
  ); // 1
  add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ); // 2
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`); // 3

  pages.forEach((p, i) => {
    const stream = `BT /F1 18 Tf 20 ${Math.round(p.height / 2)} Td (${p.text}) Tj ET`;
    const annots = (p.links ?? []).map(
      (l) =>
        `<< /Type /Annot /Subtype /Link /Rect [${l.rect.join(" ")}] /Border [0 0 0] ` +
        ("uri" in l ? `/A << /S /URI /URI (${l.uri}) >>` : `/Dest ${destTo(l.page)}`) +
        ` >>`,
    );
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[i]} 0 R` +
        (annots.length ? ` /Annots [${annots.join(" ")}]` : "") +
        ` >>`,
    );
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  if (outline.length) {
    // Entries are written in document order, each knowing its parent's index,
    // so an entry's object id is simply its position.
    const flat: { o: OutlineSpec; parent: number | null }[] = [];
    const walk = (list: OutlineSpec[], parent: number | null) => {
      for (const o of list) {
        const index = flat.length;
        flat.push({ o, parent });
        walk(o.children ?? [], index);
      }
    };
    walk(outline, null);

    const childrenOf = (parent: number | null) => {
      const out: number[] = [];
      flat.forEach((f, i) => {
        if (f.parent === parent) out.push(i);
      });
      return out;
    };
    /** /First, /Last and /Count for a list of children. */
    const span = (kids: number[]) =>
      kids.length
        ? ` /First ${entryId(kids[0]!)} 0 R /Last ${entryId(kids[kids.length - 1]!)} 0 R /Count ${kids.length}`
        : "";

    add(`<< /Type /Outlines${span(childrenOf(null))} >>`);
    flat.forEach(({ o, parent }, i) => {
      const siblings = childrenOf(parent);
      const k = siblings.indexOf(i);
      const prev = k > 0 ? ` /Prev ${entryId(siblings[k - 1]!)} 0 R` : "";
      const next =
        k < siblings.length - 1 ? ` /Next ${entryId(siblings[k + 1]!)} 0 R` : "";
      const parentId = parent === null ? outlineId : entryId(parent);
      add(
        `<< /Title (${o.title}) /Parent ${parentId} 0 R /Dest ${destTo(o.page)}` +
          `${prev}${next}${span(childrenOf(i))} >>`,
      );
    });
  }

  // Assemble, recording where each object starts: the xref table is a list of
  // byte offsets, so it can only be written once the bodies are laid out.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

/**
 * Write the fixture tree used by the smoke test: two PDFs, one of them in a
 * subfolder so the library has a folder section to fold, and a .ggb for the
 * geogebra plugin's picker.
 */
export async function writeFixtures(dir: string) {
  await Bun.write(
    `${dir}/alpha.pdf`,
    buildPdf(
      [
        {
          width: 200,
          height: 300,
          text: "Alpha page one",
          // One link out of the document and one into it, clear of the text.
          links: [
            { rect: [20, 250, 120, 280], uri: "https://example.com/" },
            { rect: [20, 20, 120, 50], page: 3 },
          ],
        },
        // A different shape on purpose: page 1's ratio must not be assumed.
        {
          width: 400,
          height: 250,
          text: "Alpha page two",
          // Links a plugin claims: one for the video window, one for GeoGebra.
          links: [
            { rect: [20, 180, 180, 210], uri: "https://youtu.be/dQw4w9WgXcQ?t=1m30s" },
            { rect: [220, 180, 380, 210], uri: "https://www.geogebra.org/m/abcd1234" },
          ],
        },
        { width: 200, height: 300, text: "Alpha page three" },
      ],
      // beta.pdf has none, so the strip is checked both ways.
      // Nested, so the strip's tree has a branch inside a branch to collapse.
      [
        {
          title: "Part one",
          page: 1,
          children: [
            { title: "Opening", page: 1 },
            { title: "Landscape", page: 2 },
          ],
        },
        { title: "The end", page: 3 },
      ],
    ),
  );
  await Bun.write(
    `${dir}/nested/beta.pdf`,
    buildPdf([{ width: 200, height: 300, text: "Beta only page" }]),
  );
  // For the geogebra plugin's listing. The bytes are never opened: the route
  // filters by extension and the picker only ever shows the path.
  await Bun.write(`${dir}/graph.ggb`, "not a real GeoGebra file\n");

  return { pdfCount: 2 };
}
