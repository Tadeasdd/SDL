"use client";

import { useEffect, useRef, useState } from "react";
import type { EvidenceDoc } from "@/core/agent/evidence";
import { LIVE_LIMITS } from "@/core/agent/live-request";
import { isLiveAvailable, runLive } from "./live-client";
import { useConsole } from "./store";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

const slug = (name: string, index: number): string =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}-${index}`;

const toBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
};

const toDoc = async (file: File, index: number): Promise<EvidenceDoc> => {
  const isImage = IMAGE_TYPES.has(file.type);
  return {
    id: slug(file.name, index),
    title: file.name,
    kind: isImage ? "image" : "note",
    mime: file.type || "text/plain",
    content: isImage ? await toBase64(file) : await file.text(),
  };
};

export function LiveDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    isLiveAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  const start = async () => {
    if (files.length > LIVE_LIMITS.maxDocs) return setProblem(`Use ${LIVE_LIMITS.maxDocs} files or fewer.`);
    if (totalBytes > LIVE_LIMITS.maxUploadBytes) return setProblem("Files are too large. The limit is 3 MB in total.");
    try {
      const docs = await Promise.all(files.map(toDoc));
      const { beginLive, receive } = useConsole.getState();
      beginLive(docs);
      onClose();
      await runLive(docs, receive);
    } catch {
      setProblem("One of those files could not be read.");
    }
  };

  return (
    <dialog ref={dialog} className="modal modal-small" onClose={onClose} aria-labelledby="live-title">
      <header className="modal-head">
        <h2 id="live-title" className="panel-title"><span>Map your lab</span></h2>
        <button className="btn" onClick={onClose}>Close</button>
      </header>
      <div className="modal-body">
        <p>Upload floor plans, inventories, SOPs, network scans or run logs. Claude reads them and builds a twin here, live. Files go to the Anthropic API and are not stored by SDL.</p>
        {available === false ? (
          <p className="notice" role="status">Live mode needs a server-side key. Set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> and restart. The example replay works without one.</p>
        ) : null}
        <label className="file">
          <span className="btn">Choose files</span>
          <input type="file" multiple accept=".csv,.json,.md,.txt,.svg,.png,.jpg,.jpeg" onChange={(event) => { setProblem(null); setFiles([...(event.target.files ?? [])]); }} />
          <span className="mono">{files.length === 0 ? "No files selected" : `${files.length} files, ${(totalBytes / 1024).toFixed(0)} KB`}</span>
        </label>
        {problem ? <p className="notice" role="alert">{problem}</p> : null}
        <button className="btn btn-solid" disabled={available !== true || files.length === 0} onClick={start}>Start mapping</button>
      </div>
    </dialog>
  );
}
