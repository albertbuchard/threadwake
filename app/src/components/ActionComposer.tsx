import { useEffect, useId, useState, type CSSProperties } from "react";
import {
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  Eye,
  GitBranch,
  Microphone,
  MicrophoneSlash,
  Play,
  Queue,
  Sparkle,
  TestTube,
  X,
} from "@phosphor-icons/react";
import type { WorkNode } from "../domain";
import type { ActionDraft, ActionKind } from "./ui-types";

export interface ActionComposerProps {
  open: boolean;
  parent: WorkNode | null;
  anchor?: { x: number; y: number };
  initialPrompt?: string;
  initialKind?: ActionKind;
  onClose: () => void;
  onAddToQueue: (draft: ActionDraft) => void;
  onRunDemo: (draft: ActionDraft) => void;
}

const ACTIONS = [
  {
    kind: "continue",
    label: "Continue",
    description: "Branch the main line of work",
    icon: GitBranch,
    prompt: "Continue this line of work from its current evidence and unresolved questions.",
  },
  {
    kind: "verify",
    label: "Verify",
    description: "Check a result against evidence",
    icon: CheckCircle,
    prompt: "Verify the result against its saved evidence and report any mismatch clearly.",
  },
  {
    kind: "test",
    label: "Test",
    description: "Run a focused check",
    icon: TestTube,
    prompt: "Design and run a focused test of the current approach, preserving the result.",
  },
  {
    kind: "report-status",
    label: "Status",
    description: "Explain progress and next steps",
    icon: ChartLineUp,
    prompt: "Report the current status, what changed, what is blocked, and the smallest next step.",
  },
  {
    kind: "summarize",
    label: "Summarize",
    description: "Recover the important context",
    icon: ClipboardText,
    prompt: "Summarize this work in plain language, including decisions, failures, and open questions.",
  },
  {
    kind: "visualize",
    label: "Visualize",
    description: "Turn the result into a visual",
    icon: Eye,
    prompt: "Create a clear visual of the current result and explain how to read it.",
  },
  {
    kind: "plan-next",
    label: "Plan next action",
    description: "Prepare a prompt and stop",
    icon: Sparkle,
    prompt: "Prepare the next action from this point, with clear inputs, outputs, and acceptance criteria. Do not run it.",
  },
] as const;

type MicrophoneState = "idle" | "listening" | "transcribed";

interface VisualViewportFrame {
  height: number;
  offsetLeft: number;
  offsetTop: number;
  safeArea: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  scale: number;
  width: number;
}

function readVisualViewportFrame(): VisualViewportFrame | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const fixtureViewport = params.get("qaVisualViewport")?.split(",").map(Number);
  const fixtureSafeArea = params.get("qaSafeArea")?.split(",").map(Number);
  if (
    fixtureViewport?.length === 5 &&
    fixtureViewport.every(Number.isFinite) &&
    fixtureViewport[2] > 0 &&
    fixtureViewport[3] > 0 &&
    fixtureViewport[4] > 0
  ) {
    const safeArea = fixtureSafeArea?.length === 4 && fixtureSafeArea.every(Number.isFinite)
      ? fixtureSafeArea.map((value) => Math.max(0, value))
      : [0, 0, 0, 0];
    return {
      offsetLeft: fixtureViewport[0],
      offsetTop: fixtureViewport[1],
      width: fixtureViewport[2],
      height: fixtureViewport[3],
      scale: fixtureViewport[4],
      safeArea: {
        top: safeArea[0],
        right: safeArea[1],
        bottom: safeArea[2],
        left: safeArea[3],
      },
    };
  }
  const viewport = window.visualViewport;
  return {
    height: viewport?.height ?? window.innerHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
    safeArea: { bottom: 0, left: 0, right: 0, top: 0 },
    scale: viewport?.scale ?? 1,
    width: viewport?.width ?? window.innerWidth,
  };
}

function viewportBoundedPosition(
  frame: VisualViewportFrame | null,
  anchor?: { x: number; y: number },
): CSSProperties | undefined {
  if (!frame) return undefined;

  if (frame.width <= 860) {
    const safe = frame.safeArea;
    return {
      bottom: "auto",
      left: `calc(${frame.offsetLeft}px + max(8px, env(safe-area-inset-left), ${safe.left}px))`,
      maxHeight: `calc(${frame.height}px - max(8px, env(safe-area-inset-top), ${safe.top}px) - max(8px, env(safe-area-inset-bottom), ${safe.bottom}px))`,
      right: "auto",
      top: `calc(${frame.offsetTop}px + max(8px, env(safe-area-inset-top), ${safe.top}px))`,
      width: `calc(${frame.width}px - max(8px, env(safe-area-inset-left), ${safe.left}px) - max(8px, env(safe-area-inset-right), ${safe.right}px))`,
    };
  }

  const edge = 18;
  const panelWidth = Math.min(640, Math.max(360, frame.width - 440));
  const availableHeight = Math.max(220, frame.height - edge * 2);
  const preferredHeight = Math.min(660, availableHeight);
  const minimumLeft = frame.offsetLeft + edge;
  const maximumLeft = frame.offsetLeft + frame.width - panelWidth - edge;
  const desiredLeft = anchor
    ? frame.offsetLeft + anchor.x + 16
    : frame.offsetLeft + Math.min(260, Math.max(edge, frame.width * 0.16));
  const left = Math.max(minimumLeft, Math.min(desiredLeft, maximumLeft));
  const minimumTop = frame.offsetTop + edge;
  const maximumTop = Math.max(
    minimumTop,
    frame.offsetTop + frame.height - preferredHeight - edge,
  );
  const desiredTop = anchor ? frame.offsetTop + anchor.y + 14 : frame.offsetTop + 94;
  const top = Math.max(minimumTop, Math.min(desiredTop, maximumTop));

  return {
    bottom: "auto",
    left,
    maxHeight: Math.max(220, frame.offsetTop + frame.height - top - edge),
    right: "auto",
    top,
    width: panelWidth,
  };
}

export function ActionComposer({
  open,
  parent,
  anchor,
  initialPrompt = "",
  initialKind = "continue",
  onClose,
  onAddToQueue,
  onRunDemo,
}: ActionComposerProps) {
  const promptId = useId();
  const [kind, setKind] = useState<ActionKind>(initialKind);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [promptTouched, setPromptTouched] = useState(Boolean(initialPrompt));
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [visualViewportFrame, setVisualViewportFrame] = useState(readVisualViewportFrame);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setPrompt(initialPrompt || ACTIONS.find((action) => action.kind === initialKind)?.prompt || "");
    setPromptTouched(Boolean(initialPrompt));
    setMicrophoneState("idle");
  }, [open, parent?.id, initialKind, initialPrompt]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const updateFrame = () => setVisualViewportFrame(readVisualViewportFrame());
    const viewport = window.visualViewport;
    updateFrame();
    viewport?.addEventListener("resize", updateFrame);
    viewport?.addEventListener("scroll", updateFrame);
    window.addEventListener("resize", updateFrame);
    return () => {
      viewport?.removeEventListener("resize", updateFrame);
      viewport?.removeEventListener("scroll", updateFrame);
      window.removeEventListener("resize", updateFrame);
    };
  }, [open]);

  if (!open || !parent) return null;

  const selectedAction = ACTIONS.find((action) => action.kind === kind) ?? ACTIONS[0];
  const isPlanOnly = kind === "plan-next";
  const draft: ActionDraft = {
    parentNodeId: parent.id,
    kind,
    prompt: prompt.trim(),
  };
  const canSubmit = Boolean(draft.prompt);
  const anchoredPosition = viewportBoundedPosition(visualViewportFrame, anchor);

  const selectAction = (nextKind: ActionKind) => {
    const nextAction = ACTIONS.find((action) => action.kind === nextKind);
    setKind(nextKind);
    if (!promptTouched && nextAction) setPrompt(nextAction.prompt);
    setMicrophoneState("idle");
  };

  const handleMicrophone = () => {
    if (microphoneState === "idle" || microphoneState === "transcribed") {
      setMicrophoneState("listening");
      return;
    }

    setPrompt(
      `From “${parent.title}”, ${selectedAction.prompt.charAt(0).toLowerCase()}${selectedAction.prompt.slice(1)}`,
    );
    setPromptTouched(true);
    setMicrophoneState("transcribed");
  };

  return (
    <section
      className="action-composer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="action-composer-title"
      data-visual-viewport={`${visualViewportFrame?.offsetLeft ?? 0},${visualViewportFrame?.offsetTop ?? 0},${visualViewportFrame?.width ?? 0},${visualViewportFrame?.height ?? 0}`}
      data-visual-viewport-scale={visualViewportFrame?.scale ?? 1}
      style={anchoredPosition}
    >
      <header className="composer-header">
        <div>
          <p className="composer-eyebrow">From {parent.title}</p>
          <h2 id="action-composer-title">What should happen next?</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close action composer"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <div className="composer-body" data-scroll-container="action-composer-body">
        <fieldset className="quick-actions">
          <legend>Choose an action</legend>
          <div className="quick-action-grid">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <label
                  className={`quick-action${kind === action.kind ? " quick-action--selected" : ""}`}
                  key={action.kind}
                >
                  <input
                    type="radio"
                    name="action-kind"
                    value={action.kind}
                    checked={kind === action.kind}
                    onChange={() => selectAction(action.kind)}
                  />
                  <Icon aria-hidden="true" size={18} weight="duotone" />
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="composer-prompt">
          <div className="field-label-row">
            <label className="field-label" htmlFor={promptId}>
              Editable prompt
            </label>
            <span>{prompt.length} characters</span>
          </div>
          <div className="composer-textarea-wrap">
            <textarea
              id={promptId}
              rows={5}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setPromptTouched(true);
              }}
              placeholder="Describe the next piece of work in plain language."
              autoFocus
            />
            <button
              className={`microphone-button microphone-button--${microphoneState}`}
              type="button"
              onClick={handleMicrophone}
              aria-label={
                microphoneState === "listening"
                  ? "Use the mocked voice transcript"
                  : "Start mocked voice input"
              }
            >
              {microphoneState === "listening" ? (
                <MicrophoneSlash aria-hidden="true" size={18} weight="fill" />
              ) : (
                <Microphone aria-hidden="true" size={18} />
              )}
            </button>
          </div>
          <p className="microphone-state" aria-live="polite">
            {microphoneState === "listening"
              ? "Mock listening… press again to insert the demo transcript."
              : microphoneState === "transcribed"
                ? "Mock transcript inserted. You can edit it before continuing."
                : "Optional mocked microphone — no audio is recorded."}
          </p>
        </div>

        {isPlanOnly ? (
          <div className="plan-boundary" id="plan-boundary-note">
            <Queue aria-hidden="true" size={18} weight="duotone" />
            <p>
              <strong>This prepares work; it does not run it.</strong> The draft will enter
              the queue, where you can edit it, chain children, choose Plan or Goal, and
              explicitly press Play later.
            </p>
          </div>
        ) : (
          <p className="demo-boundary">
            “Run demo” starts a visible deterministic simulation, never a real agent.
          </p>
        )}
      </div>

      <footer className="composer-footer">
        <button
          className="button button--secondary"
          type="button"
          disabled={!canSubmit}
          onClick={() => onAddToQueue(draft)}
        >
          <Queue aria-hidden="true" size={18} />
          {isPlanOnly ? "Add planned action" : "Add to queue"}
        </button>
        <button
          className="button button--primary"
          type="button"
          disabled={!canSubmit || isPlanOnly}
          aria-describedby={isPlanOnly ? "plan-boundary-note" : undefined}
          onClick={() => onRunDemo(draft)}
        >
          <Play aria-hidden="true" size={18} weight="fill" /> Run demo
        </button>
      </footer>
    </section>
  );
}
