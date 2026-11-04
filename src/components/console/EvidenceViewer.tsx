"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EvidenceDoc } from "@/core/agent/evidence";
import { useConsole } from "./store";

const flatten = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

const isPicture = (doc: EvidenceDoc): boolean => doc.kind === "drawing" || doc.kind === "image";

const pictureSrc = (doc: EvidenceDoc): string =>
  doc.kind === "image" ? `data:${doc.mime};base64,${doc.content}` : `data:image/svg+xml;utf8,${encodeURIComponent(doc.content)}`;

function Lines({ doc, quote }: { doc: EvidenceDoc; quote?: string }) {
  const hit = useRef<HTMLLIElement>(null);
  const lines = useMemo(() => doc.content.split("\n"), [doc]);
  const target = quote === undefined ? -1 : lines.findIndex((line) => flatten(line).includes(flatten(quote)));
  useEffect(() => hit.current?.scrollIntoView({ block: "center" }), [target]);
  return (
    <ol className="source">
      {lines.map((line, index) => (
        <li key={index} ref={index === target ? hit : undefined} className={index === target ? "is-hit" : ""}>
          <span>{index + 1}</span><code>{line}</code>
        </li>
      ))}
    </ol>
  );
}

function Body({ doc, quote }: { doc: EvidenceDoc; quote?: string }) {
  const [showSource, setShowSource] = useState(quote !== undefined);
  if (!isPicture(doc) || showSource) {
    return (
      <>
        {isPicture(doc) ? <button className="btn" onClick={() => setShowSource(false)}>Show drawing</button> : null}
        <Lines doc={doc} quote={quote} />
      </>
    );
  }
  return (
    <>
      {doc.kind === "drawing" ? <button className="btn" onClick={() => setShowSource(true)}>Show source</button> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI; an img also keeps any script in an SVG inert. */}
      <img className="drawing" src={pictureSrc(doc)} alt={doc.title} />
    </>
  );
}

export function EvidenceViewer() {
  const focus = useConsole((state) => state.focus);
  const docs = useConsole((state) => state.docs);
  const open = useConsole((state) => state.openEvidence);
  const dialog = useRef<HTMLDialogElement>(null);
  const doc = docs.find((item) => item.id === focus?.docId);

  useEffect(() => {
    if (doc !== undefined && dialog.current?.open === false) dialog.current.showModal();
  }, [doc]);

  if (doc === undefined) return null;
  return (
    <dialog ref={dialog} className="modal" onClose={() => open(null)} aria-labelledby="evidence-title">
      <header className="modal-head">
        <h2 id="evidence-title" className="panel-title"><span>{doc.title}</span><span>{doc.kind}</span></h2>
        <button className="btn" onClick={() => open(null)}>Close</button>
      </header>
      <div className="modal-body"><Body key={`${doc.id}:${focus?.quote}`} doc={doc} quote={focus?.quote} /></div>
    </dialog>
  );
}
