"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { movingKeeps, movingParts } from "./moving-content";
import { MovingDrawing } from "./moving-drawings";

const IdeasDialog = dynamic(() => import("./moving-ideas-dialog"), {
  ssr: false,
});
export function MovingParts() {
  const [part, setPart] = useState(0);
  const panel = (i: number) => (
    <div className="moving-part-panel">
      <MovingDrawing kind={i} />
      <div>
        <p className="moving-tags">{movingParts[i].tags}</p>
        <h3>{movingParts[i].name}</h3>
        <dl>
          <div>
            <dt>Your AI</dt>
            <dd>{movingParts[i].ai}</dd>
          </div>
          <div>
            <dt>Kept here</dt>
            <dd>{movingParts[i].kept}</dd>
          </div>
        </dl>
        <IdeasButton part={i} />
      </div>
    </div>
  );
  return (
    <>
      <div className="moving-desktop-parts">
        <div className="moving-stepper" aria-label="Parts of your move">
          {movingParts.map((p, i) => (
            <button
              key={p.name}
              type="button"
              aria-pressed={part === i}
              aria-controls="moving-selected-part"
              onClick={() => setPart(i)}
            >
              <span aria-hidden="true" />
              {p.name}
            </button>
          ))}
        </div>
        <div id="moving-selected-part">{panel(part)}</div>
      </div>
      <div className="moving-phone-parts">
        {movingParts.map((p, i) => (
          <div className="moving-fold" key={p.name}>
            <h3>
              <button
                type="button"
                aria-expanded={part === i}
                aria-controls={`moving-part-${i}`}
                onClick={() => setPart(i)}
              >
                {p.name}
                <span aria-hidden="true">{part === i ? "−" : "+"}</span>
              </button>
            </h3>
            <div id={`moving-part-${i}`} hidden={part !== i}>
              {panel(i)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
export function MovingKeeps() {
  const [chosen, setChosen] = useState(0);
  const [arrow, setArrow] = useState(30);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const parent = row.current;
      const button = parent?.querySelector<HTMLButtonElement>(
        `button[data-keep="${chosen}"]`,
      );
      if (parent && button)
        setArrow(button.offsetLeft + button.offsetWidth / 2);
    };
    update();
    const observer = new ResizeObserver(update);
    if (row.current) observer.observe(row.current);
    return () => observer.disconnect();
  }, [chosen]);
  return (
    <div className="moving-keeps">
      <h3>
        It keeps <span>· pick one</span>
      </h3>
      <div className="moving-chips" ref={row}>
        {movingKeeps.map(([name], i) => (
          <button
            key={name}
            type="button"
            data-keep={i}
            aria-pressed={chosen === i}
            aria-controls="moving-keep-note"
            onClick={() => setChosen(i)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        id="moving-keep-note"
        className="moving-note"
        style={{ "--note-arrow": `${arrow}px` } as React.CSSProperties}
        aria-live="polite"
      >
        <strong>{movingKeeps[chosen][0]}.</strong> {movingKeeps[chosen][1]}
      </div>
    </div>
  );
}
export function IdeasButton({ part }: { part?: number }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="moving-text-button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        {part === undefined ? `All ${movingParts.length} ideas →` : "1 idea →"}
      </button>
      {loaded && (
        <IdeasDialog
          open={open}
          part={part}
          onOpenChange={setOpen}
          returnFocus={() => opener.current?.focus()}
        />
      )}
    </>
  );
}
