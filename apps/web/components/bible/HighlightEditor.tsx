"use client";
import { HIGHLIGHT_COLOR_LABEL, HIGHLIGHT_COLORS, type HighlightColor } from "@bk/schemas";
import { useId, useState } from "react";

type Props = {
  initialColor?: HighlightColor;
  initialAnnotation?: string;
  saveLabel: string;
  busy?: boolean;
  onSave: (color: HighlightColor, annotation: string) => void;
  onCancel: () => void;
};

/** BK-013: choose a color and an optional short annotation. */
export function HighlightEditor({ initialColor = "geel", initialAnnotation = "", saveLabel, busy, onSave, onCancel }: Props) {
  const ids = useId();
  const [color, setColor] = useState<HighlightColor>(initialColor);
  const [annotation, setAnnotation] = useState(initialAnnotation);
  return (
    <form
      className="highlight-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(color, annotation.trim());
      }}
    >
      <fieldset className="highlight-colors">
        <legend>Kleur</legend>
        {HIGHLIGHT_COLORS.map((c) => (
          <label key={c} className={`swatch-choice hl-${c}`}>
            <input type="radio" name={`${ids}-color`} value={c} checked={color === c} onChange={() => setColor(c)} />
            {HIGHLIGHT_COLOR_LABEL[c]}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`${ids}-note`}>Aantekening (optioneel)</label>
        <input id={`${ids}-note`} type="text" maxLength={500} value={annotation} onChange={(e) => setAnnotation(e.target.value)} />
      </div>
      <div className="selection-actions">
        <button type="submit" className="button" disabled={busy}>
          {saveLabel}
        </button>
        <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
