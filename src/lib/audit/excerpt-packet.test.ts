import assert from "node:assert/strict";
import test from "node:test";
import { buildExcerptPacket } from "./excerpt-packet";

test("buildExcerptPacket shapes excerpt items and bounds text", () => {
  const longText = `  ${"A".repeat(1300)}  `;
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          content: [
            {
              id: "item-1",
              name: "Rates Summary",
              page_ref: "10",
              page_number: 10,
              pages: "10",
              content: longText,
            },
          ],
        }),
      },
    ],
  };

  const packet = buildExcerptPacket(
    { doc_name: "Requested Doc" },
    result,
    "get_page_content",
  );

  assert.equal(packet.length, 1);
  assert.deepEqual(packet[0], {
    ordinal: 0,
    tool_name: "get_page_content",
    document_name: "Rates Summary",
    document_item_id: "item-1",
    page_ref: "10",
    excerpt_text: `${"A".repeat(1200)}...`,
    page_number: 10,
    requested_pages: "10",
  });
});

test("buildExcerptPacket preserves order and caps excerpts at eight items", () => {
  const docs = Array.from({ length: 10 }, (_, index) => ({
    id: `item-${index}`,
    name: `Doc ${index}`,
    page_ref: String(index + 1),
    snippet: `Snippet ${index}`,
  }));
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify({ docs }),
      },
    ],
  };

  const packet = buildExcerptPacket(
    { query: "night work" },
    result,
    "find_relevant_documents",
  );

  assert.equal(packet.length, 8);
  assert.deepEqual(
    packet.map((item) => [item.ordinal, item.document_name]),
    [
      [0, "Doc 0"],
      [1, "Doc 1"],
      [2, "Doc 2"],
      [3, "Doc 3"],
      [4, "Doc 4"],
      [5, "Doc 5"],
      [6, "Doc 6"],
      [7, "Doc 7"],
    ],
  );
});

test("buildExcerptPacket prefers item-level document name over requested input", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          content: [
            {
              page_ref: "10",
              text: "Scoped excerpt",
              name: "Item-Level Name",
            },
          ],
        }),
      },
    ],
  };

  const packet = buildExcerptPacket(
    { doc_name: "Requested Name" },
    result,
    "get_page_content",
  );

  assert.equal(packet.length, 1);
  assert.equal(packet[0].document_name, "Item-Level Name");
});

test("buildExcerptPacket falls back to requested input document name when item name is absent", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          content: [
            {
              page_ref: "10",
              page_number: 10,
              text: "Scoped excerpt",
              pages: "10",
            },
          ],
        }),
      },
    ],
  };

  const packet = buildExcerptPacket(
    { doc_name: "Requested Name" },
    result,
    "get_page_content",
  );

  assert.deepEqual(packet, [
    {
      ordinal: 0,
      tool_name: "get_page_content",
      document_name: "Requested Name",
      document_item_id: null,
      page_ref: "10",
      excerpt_text: "Scoped excerpt",
      page_number: 10,
      requested_pages: "10",
    },
  ]);
});
