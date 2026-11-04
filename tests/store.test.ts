import { describe, expect, it } from "vitest";
import { useConsole } from "@/components/console/store";
import { loadExampleDocs } from "@/lib/load-example";

describe("console store", () => {
  it("replays the example after a live run replaced the visible documents", () => {
    const store = useConsole.getState();
    store.init(loadExampleDocs());
    store.beginLive([{ id: "upload", title: "Upload", kind: "note", mime: "text/plain", content: "x" }]);
    useConsole.getState().startReplay();
    useConsole.getState().skipReplay();
    const { agent, docs, source } = useConsole.getState();
    expect(source).toBe("replay");
    expect(agent.status).toBe("done");
    expect(docs.map((doc) => doc.id)).toContain("floorplan");
  });
});
