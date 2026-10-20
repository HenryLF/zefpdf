import { useEffect, useMemo } from "preact/hooks";
import { OptionHint, SelectOption, useFiles } from "@/plugins/sdk";
import { SourceOptions } from "../shared/SourceOptions";
import { parseSource } from "./links";
import { APPS, useGeogebra, type AppName } from "./store";

export function Options() {
  const appName = useGeogebra((s) => s.appName);
  const file = useGeogebra((s) => s.file);
  const source = useGeogebra((s) => s.source);
  const files = useFiles((s) => s.files);
  const materials = useMemo(() => files.filter((f) => f.path.toLowerCase().endsWith(".ggb")), [files]);
  const status = useGeogebra((s) => s.status);
  const loaded = useGeogebra((s) => s.loaded);
  const refresh = useGeogebra((s) => s.refresh);
  const set = useGeogebra((s) => s.set);
  const load = useGeogebra((s) => s.load);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const parsed = parseSource(source);

  return (
    <>
      <SelectOption
        label="App"
        value={appName}
        onChange={(v) => set("appName", v as AppName)}
      >
        {Object.entries(APPS).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </SelectOption>

      <SelectOption
        label="File from this folder"
        value={file}
        onChange={(v) => set("file", v)}
      >
        <option value="">None — use the link below</option>
        {materials.map((m) => (
          <option key={m.path} value={m.path}>
            {m.path}
          </option>
        ))}
      </SelectOption>

      {/* Loading means injecting a fresh applet, and it opens the calculator
          window if it is not up yet — hence the warning that it starts over. */}
      <SourceOptions
        label="Link or geogebra.org material ID"
        value={source}
        placeholder="https://…/worksheet.ggb or mMFYnJDT"
        // A file in the folder is the better source when there is one, and
        // having both set would silently ignore this.
        disabled={file !== ""}
        onInput={(v) => set("source", v)}
        hint={
          file !== ""
            ? "A file from the folder is chosen, so this is not used."
            : source.trim() === ""
              ? "Paste a link to a .ggb file or to a geogebra.org material, or a material ID. Empty opens a blank calculator."
              : !parsed
                ? "Not a link or a material ID."
                : "materialId" in parsed
                  ? `geogebra.org material ${parsed.materialId}.`
                  : "A file fetched by the server, so a host that sends no CORS header still works."
        }
        action="Load in the calculator"
        onAction={load}
      />

      <OptionHint>
        Loading starts a fresh applet, so a construction in progress is lost.
      </OptionHint>

      <OptionHint>
        {materials.length === 0
            ? "No .ggb files in the folder being served — put one beside your PDFs and it will appear here."
            : `${materials.length} .ggb file${materials.length > 1 ? "s" : ""} in the folder being served.`}
      </OptionHint>

      <OptionHint>
        {!loaded ? (
          "Checking for the offline bundle…"
        ) : status?.codebase ? (
          "Running from the local bundle: no connection needed."
        ) : (
          <>
            The calculator itself is fetched from geogebra.org. To work offline,
            unzip the GeoGebra Math Apps Bundle into{" "}
            <code>plugins/geogebra/static/bundle/</code> (without its versioned top
            folder, so that <code>bundle/GeoGebra/HTML5</code> exists) and reopen it. A link or a
            material ID always needs a connection.
          </>
        )}
      </OptionHint>
    </>
  );
}
