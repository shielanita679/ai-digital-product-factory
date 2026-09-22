"use client";

import * as React from "react";

const DRAFT_KEY = "create-product-wizard-draft";

/**
 * Per-viewer convenience only (survives an accidental refresh mid-wizard,
 * cleared on submit or discard — never a source of truth, never shared,
 * never read by the server). A saved draft is never auto-applied to the
 * live wizard state — the caller shows a "resume?" prompt and the user
 * decides, via `resumeDraft()`/`discardDraft()`.
 *
 * The one-time mount check below reads sessionStorage exactly once, via
 * an effect with an empty dependency array. This intentionally reads an
 * external system and calls setState with what it finds — the case the
 * set-state-in-effect rule's own guidance describes as fine ("subscribe
 * for updates from some external system, calling setState ... when
 * external state changes"), not the "isMounted" antipattern it targets.
 * A reactive read (e.g. via useSyncExternalStore) was tried first and
 * rejected: it re-reads sessionStorage on every render, so it kept
 * re-detecting this component's own autosave writes as a "new" draft and
 * the resume prompt never stayed dismissed — confirmed by testing against
 * a real running instance, not just reasoned about.
 */
export function useWizardDraft<T>(initial: T) {
  const [initialJson] = React.useState(() => JSON.stringify(initial));
  const [state, setState] = React.useState<T>(initial);
  const [pendingDraft, setPendingDraft] = React.useState<Partial<T> | null>(null);
  const [draftHandled, setDraftHandled] = React.useState(false);
  const [readyToPersist, setReadyToPersist] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see doc comment above
        setPendingDraft(JSON.parse(raw) as Partial<T>);
      }
    } catch {
      // Ignore — nothing to offer.
    } finally {
      setReadyToPersist(true);
    }
  }, []);

  const hasPendingDraft = !draftHandled && pendingDraft !== null;

  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore.
    }
  }

  function resumeDraft() {
    if (pendingDraft) {
      setState((current) => ({ ...current, ...pendingDraft }));
    }
    setDraftHandled(true);
  }

  function discardDraft() {
    setDraftHandled(true);
    clearDraft();
  }

  React.useEffect(() => {
    // Don't persist anything until the mount-time draft check has run
    // (avoids a blank-state write racing ahead of it) and don't clobber a
    // not-yet-resolved saved draft while the resume prompt is showing.
    if (!readyToPersist || hasPendingDraft) return;
    try {
      const currentJson = JSON.stringify(state);
      if (currentJson === initialJson) {
        // Nothing worth resuming (e.g. right after "Start fresh," before
        // any new input) — don't save it, so a later reload doesn't offer
        // to "resume" blank data.
        sessionStorage.removeItem(DRAFT_KEY);
      } else {
        sessionStorage.setItem(DRAFT_KEY, currentJson);
      }
    } catch {
      // Ignore — draft persistence is a convenience, not a requirement.
    }
  }, [state, hasPendingDraft, readyToPersist, initialJson]);

  return { state, setState, hasPendingDraft, resumeDraft, discardDraft, clearDraft };
}
