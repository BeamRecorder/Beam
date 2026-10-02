#!/usr/bin/env node
import { runCliCommand } from './cli-runner';

void runCliCommand(process.argv.slice(2))
  .then((result) => {
    if (result !== undefined) process.stdout.write(JSON.stringify(result) + '\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }) + '\n',
    );
    process.exitCode = 1;
  });
