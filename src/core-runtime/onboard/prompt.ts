import readline from "node:readline";

/**
 * Minimal interactive prompts over Node's built-in readline (no dependency).
 * Callers must confirm `process.stdin.isTTY` before using these.
 */

export interface Choice {
  id: string;
  label: string;
  detail?: string;
}

function createInterface(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Numbered multi-select. The user enters comma/space-separated numbers; empty
 * input accepts `defaultSelectedIds`. Returns the chosen choice ids in list order.
 */
export async function promptMultiSelect(
  title: string,
  choices: Choice[],
  defaultSelectedIds: string[],
): Promise<string[]> {
  const rl = createInterface();
  try {
    console.log(title);
    choices.forEach((choice, index) => {
      const mark = defaultSelectedIds.includes(choice.id) ? "*" : " ";
      const detail = choice.detail ? `  — ${choice.detail}` : "";
      console.log(`  [${mark}] ${index + 1}) ${choice.label}${detail}`);
    });
    const answer = (
      await ask(
        rl,
        "Select numbers (comma/space separated, blank = starred defaults): ",
      )
    ).trim();
    if (answer.length === 0) {
      return choices.filter((c) => defaultSelectedIds.includes(c.id)).map((c) => c.id);
    }
    const picked = new Set<string>();
    for (const token of answer.split(/[\s,]+/).filter(Boolean)) {
      const index = Number.parseInt(token, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < choices.length) {
        picked.add(choices[index]!.id);
      }
    }
    return choices.filter((c) => picked.has(c.id)).map((c) => c.id);
  } finally {
    rl.close();
  }
}

/** Yes/no confirmation. Empty input returns `defaultYes`. */
export async function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const rl = createInterface();
  try {
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = (await ask(rl, `${question} ${suffix} `)).trim().toLowerCase();
    if (answer.length === 0) return defaultYes;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
