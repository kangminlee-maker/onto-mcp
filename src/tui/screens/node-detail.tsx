/**
 * Drill-down detail pane for the node selected in the WorkflowTree HUD — shows
 * the node's status/owner/attempts/failure/output and a tail of its output (the
 * running log / authored artifact). Pure presentation.
 */
import { Box, Text } from "ink";
import type { TreeNode } from "../view-model/tree-view-model.js";

export interface NodeDetailProps {
  node: TreeNode;
  /** Lines of the node's output (from readOutputTail), most recent last. */
  tail: string[];
}

export function NodeDetail({ node, tail }: NodeDetailProps): JSX.Element {
  const meta: string[] = [`status ${node.status}`];
  if (node.owner) meta.push(`owner ${node.owner}`);
  if (node.attempts && node.attempts > 1) meta.push(`try${node.attempts}`);
  if (node.signalAgeSec != null) meta.push(`${node.signalAgeSec}s`);
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold>{node.label}</Text>
      <Text dimColor>{meta.join(" · ")}</Text>
      {node.failureMessage ? <Text color="red">{node.failureMessage}</Text> : null}
      {node.outputPath ? <Text dimColor>{node.outputPath}</Text> : null}
      {tail.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>── output (tail) ──</Text>
          {tail.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
