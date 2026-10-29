/**
 * Splits a .sql file into individual statements.
 *
 * MySQL's DELIMITER directive is a CLIENT-side command, not part of the wire
 * protocol, so sending the file as one multi-statement query fails the moment
 * it hits `DELIMITER $$`. It also cannot work with multipleStatements: a
 * procedure body is full of `;` characters that the server would treat as
 * statement terminators.
 *
 * So we keep the DELIMITER directives in the file (they are what makes the
 * file importable in MySQL Workbench by hand) and honour them here instead.
 *
 *   splitStatements(sql) -> ["CREATE TABLE ...;", "CREATE PROCEDURE ... END"]
 */
export function splitStatements(sql) {
  const statements = [];
  const lines = sql.split(/\r?\n/);

  let delimiter = ";";
  let buffer = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) statements.push(text);
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // `DELIMITER $$` on its own line switches the terminator for what follows.
    const delimiterMatch = trimmed.match(/^DELIMITER\s+(\S+)$/i);
    if (delimiterMatch) {
      flush();
      delimiter = delimiterMatch[1];
      continue;
    }

    buffer.push(line);

    // A statement ends at the delimiter, but only when it is not inside a
    // comment. Checking the accumulated text keeps `--` and `/* */` safe.
    if (endsWithDelimiter(buffer, delimiter)) {
      // Strip ONLY the delimiter. The terminator often shares a line with real
      // SQL -- `) ENGINE=InnoDB ...;` -- so dropping the whole line would take
      // the table options with it.
      buffer[buffer.length - 1] = buffer[buffer.length - 1].slice(
        0,
        buffer[buffer.length - 1].lastIndexOf(delimiter)
      );
      flush();
    }
  }

  flush();
  return statements.filter(Boolean);
}

function endsWithDelimiter(buffer, delimiter) {
  const text = stripTrailingComments(buffer.join("\n"));
  return text.trimEnd().endsWith(delimiter);
}

/**
 * Removes a trailing `-- comment` or the tail of a block comment so a
 * semicolon inside prose does not look like a terminator.
 */
function stripTrailingComments(text) {
  let out = text;

  // Drop a block comment that runs to the end of the buffer.
  const lastBlock = out.lastIndexOf("/*");
  const lastBlockEnd = out.lastIndexOf("*/");
  if (lastBlock > -1 && lastBlock > lastBlockEnd) {
    out = out.slice(0, lastBlock);
  }

  // Drop a trailing line comment, but keep the newline so the last real
  // statement line is still inspected.
  const lines = out.split("\n");
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (last === "" || last.startsWith("--")) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join("\n");
}