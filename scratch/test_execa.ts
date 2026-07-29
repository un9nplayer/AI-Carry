import { execa } from 'execa';

async function test() {
  try {
    console.log("Testing execa standard call...");
    const result = await execa("mkdir -p agniops && touch agniops/file.txt", {
      shell: true,
      reject: false,
      timeout: 30000,
    });
    console.log("Exit code:", result.exitCode);
    console.log("Stdout:", result.stdout);
    console.log("Stderr:", result.stderr);
  } catch (err: any) {
    console.error("Execa threw error:", err);
  }
}

test();
