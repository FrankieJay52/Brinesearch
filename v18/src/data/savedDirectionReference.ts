export type SavedDirectionSource = "directions_clear" | "written_directions";

export interface SavedDirectionStep {
  number: number;
  instruction: string;
}

export interface SavedDirectionReference {
  rawText: string;
  displayText: string;
  roadSequenceReference: string | null;
  orderedSteps: SavedDirectionStep[];
  additionalNotes: string[];
  source: SavedDirectionSource;
  structured: boolean;
  preservedSourceText: {
    directionsClear: string | null;
    writtenDirections: string | null;
  };
}

export interface SavedDirectionReferenceInput {
  directionsClear?: string | null;
  writtenDirections?: string | null;
}

const ROAD_SEQUENCE_HEADER = "Road sequence reference:";
const STEP_BY_STEP_HEADER = "Step-by-step directions:";

function hasSavedText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function displaySavedDirectionText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\r\\n|\\n|\\r/g, "\n");
}

function isSectionHeader(value: string) {
  return value === ROAD_SEQUENCE_HEADER || value === STEP_BY_STEP_HEADER;
}

function parsedStep(value: string): SavedDirectionStep | null {
  const match = value.match(/^(\d+)\.\s+(.+)$/);
  if (!match) return null;

  return {
    number: Number.parseInt(match[1], 10),
    instruction: match[2],
  };
}

export function parseSavedDirectionReference({
  directionsClear = null,
  writtenDirections = null,
}: SavedDirectionReferenceInput): SavedDirectionReference | null {
  const rawDirectionsClear = hasSavedText(directionsClear) ? directionsClear : null;
  const rawWrittenDirections = hasSavedText(writtenDirections) ? writtenDirections : null;
  const rawText = rawDirectionsClear ?? rawWrittenDirections;
  if (rawText === null) return null;

  const source: SavedDirectionSource = rawDirectionsClear !== null
    ? "directions_clear"
    : "written_directions";
  const displayText = displaySavedDirectionText(rawText);
  const preservedSourceText = {
    directionsClear: directionsClear ?? null,
    writtenDirections: writtenDirections ?? null,
  };

  // Raw written_directions predates the cleaned section format. Keep it as one
  // unstructured reference rather than inferring roads, turns, or mileage.
  if (source === "written_directions") {
    return {
      rawText,
      displayText,
      roadSequenceReference: null,
      orderedSteps: [],
      additionalNotes: [displayText],
      source,
      structured: false,
      preservedSourceText,
    };
  }

  const lines = displayText.split("\n");
  const orderedSteps: SavedDirectionStep[] = [];
  const additionalNotes: string[] = [];
  let roadSequenceReference: string | null = null;
  let structured = false;
  let insideStepSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    if (line === ROAD_SEQUENCE_HEADER) {
      structured = true;
      insideStepSection = false;
      const candidate = lines[index + 1] ?? "";
      if (candidate.trim() && !isSectionHeader(candidate) && parsedStep(candidate) === null) {
        roadSequenceReference = candidate;
        index += 1;
      }
      continue;
    }

    if (line === STEP_BY_STEP_HEADER) {
      structured = true;
      insideStepSection = true;
      continue;
    }

    const step = insideStepSection ? parsedStep(line) : null;
    if (step !== null) {
      orderedSteps.push(step);
      continue;
    }

    additionalNotes.push(line);
  }

  if (!structured) {
    return {
      rawText,
      displayText,
      roadSequenceReference: null,
      orderedSteps: [],
      additionalNotes: [displayText],
      source,
      structured: false,
      preservedSourceText,
    };
  }

  return {
    rawText,
    displayText,
    roadSequenceReference,
    orderedSteps,
    additionalNotes,
    source,
    structured,
    preservedSourceText,
  };
}
