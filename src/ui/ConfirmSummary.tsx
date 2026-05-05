import React from 'react';
import { Box, Text } from 'ink';

export function ConfirmSummary({ lines }: { lines: string[] }): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>The following actions will run:</Text>
      {lines.map((l, i) => <Text key={i}>  • {l}</Text>)}
      <Box marginTop={1}><Text dimColor>enter to install · q to abort</Text></Box>
    </Box>
  );
}
