// @ts-nocheck
/**
 * Equivalence and Performance Test Suite for transformPapersToSubjectSlots
 */
const assert = require("node:assert");

// 1. Original Implementation (for strict baseline comparison)
function originalTransformPapersToSubjectSlots(papers) {
  return papers.reduce((acc, paper) => {
    const existing = acc.find((item) => item.subject === paper.subject);

    if (existing) {
      if (!existing.slots.includes(paper.slot)) {
        existing.slots.push(paper.slot);
      }
    } else {
      acc.push({ subject: paper.subject, slots: [paper.slot] });
    }

    return acc;
  }, []);
}

// 2. Refactored Map/Set Implementation
function refactoredTransformPapersToSubjectSlots(papers) {
  if (!papers || papers.length === 0) {
    return [];
  }

  const subjectMap = new Map();
  const result = [];

  for (const paper of papers) {
    if (!paper) continue;
    const subject = paper.subject;
    const slot = paper.slot;

    const entry = subjectMap.get(subject);
    if (!entry) {
      const slotsList = [slot];
      const slotsSet = new Set([slot]);
      subjectMap.set(subject, { slotsSet, slotsList });
      result.push({ subject, slots: slotsList });
    } else if (!entry.slotsSet.has(slot)) {
      entry.slotsSet.add(slot);
      entry.slotsList.push(slot);
    }
  }

  return result;
}

function runTests() {
  console.log("============================================================");
  console.log("RUNNING EQUIVALENCE TESTS: transformPapersToSubjectSlots");
  console.log("============================================================\n");

  const testCases = [
    {
      name: "1. Empty Array",
      input: [],
    },
    {
      name: "2. Single Paper",
      input: [
        { subject: "Calculus", slot: "A1+TA1" }
      ],
    },
    {
      name: "3. Multiple Subjects (distinct)",
      input: [
        { subject: "Calculus", slot: "A1" },
        { subject: "Physics", slot: "B1" },
        { subject: "Chemistry", slot: "C1" },
      ],
    },
    {
      name: "4. Interleaved Subjects",
      input: [
        { subject: "Calculus", slot: "A1" },
        { subject: "Physics", slot: "B1" },
        { subject: "Calculus", slot: "A2" },
        { subject: "Chemistry", slot: "C1" },
        { subject: "Physics", slot: "B2" },
        { subject: "Calculus", slot: "A3" },
      ],
    },
    {
      name: "5. Duplicate Slots (same subject)",
      input: [
        { subject: "Calculus", slot: "A1" },
        { subject: "Calculus", slot: "A1" },
        { subject: "Calculus", slot: "A1" },
      ],
    },
    {
      name: "6. Multiple Distinct Slots for One Subject",
      input: [
        { subject: "Data Structures", slot: "D1" },
        { subject: "Data Structures", slot: "D2" },
        { subject: "Data Structures", slot: "E1" },
        { subject: "Data Structures", slot: "E2" },
      ],
    },
    {
      name: "7. Empty-String Slot",
      input: [
        { subject: "Unknown Course", slot: "" },
        { subject: "Unknown Course", slot: "A1" },
        { subject: "Unknown Course", slot: "" },
      ],
    },
    {
      name: "8. Subject and Slot Ordering Integrity",
      input: [
        { subject: "SubZ", slot: "Slot9" },
        { subject: "SubA", slot: "Slot1" },
        { subject: "SubM", slot: "Slot5" },
        { subject: "SubA", slot: "Slot2" },
        { subject: "SubZ", slot: "Slot1" },
        { subject: "SubM", slot: "Slot5" }, // duplicate
      ],
    },
    {
      name: "9. Large Realistic Multi-Subject Dataset (100 papers)",
      input: Array.from({ length: 100 }, (_, i) => ({
        subject: `Course_${i % 10}`,
        slot: `Slot_${(i * 3) % 7}`,
      })),
    },
  ];

  let passedCount = 0;

  for (const tc of testCases) {
    const origOutput = originalTransformPapersToSubjectSlots(tc.input);
    const refactoredOutput = refactoredTransformPapersToSubjectSlots(tc.input);

    try {
      assert.deepStrictEqual(refactoredOutput, origOutput);
      console.log(`[PASS] ${tc.name}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] ${tc.name}`);
      console.error("  Original:", JSON.stringify(origOutput));
      console.error("  Refactored:", JSON.stringify(refactoredOutput));
      throw err;
    }
  }

  console.log(`\nAll ${passedCount}/${testCases.length} equivalence test cases passed!`);

  // 10. Performance benchmark comparison (10,000 papers)
  console.log("\n------------------------------------------------------------");
  console.log("PERFORMANCE BENCHMARK: 10,000 papers with 50 distinct subjects");
  console.log("------------------------------------------------------------");

  const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
    subject: `Subject_${i % 50}`,
    slot: `Slot_${(i * 7) % 20}`,
  }));

  const t0 = performance.now();
  const origRes = originalTransformPapersToSubjectSlots(largeDataset);
  const origTime = performance.now() - t0;

  const t1 = performance.now();
  const refactoredRes = refactoredTransformPapersToSubjectSlots(largeDataset);
  const refactoredTime = performance.now() - t1;

  assert.deepStrictEqual(refactoredRes, origRes);

  console.log(`Original O(N*S) Time:   ${origTime.toFixed(3)} ms`);
  console.log(`Refactored O(N) Time:   ${refactoredTime.toFixed(3)} ms`);
  console.log(`Speedup Factor:         ${(origTime / refactoredTime).toFixed(1)}x faster`);
  console.log(`CPU Time Reduction:     ${(((origTime - refactoredTime) / origTime) * 100).toFixed(1)}%`);
  console.log("------------------------------------------------------------\n");
}

runTests();
