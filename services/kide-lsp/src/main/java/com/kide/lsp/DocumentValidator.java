package com.kide.lsp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Optional;

public final class DocumentValidator {
    private static final ObjectMapper JSON = new ObjectMapper();

    private record Position(int line, int character) {}
    private record OpenBracket(char symbol, Position position) {}

    public ArrayNode validate(String uri, String text) {
        ArrayNode diagnostics = JSON.createArrayNode();
        if (text == null) text = "";

        Optional<LanguageCatalog.LanguageSpec> language = LanguageCatalog.fromUri(uri);
        if (language.isEmpty()) {
            diagnostics.add(diagnostic(
                    0,
                    0,
                    0,
                    1,
                    2,
                    "kide.unknown-language",
                    "File extension is not registered with the KIDE language service."));
            return diagnostics;
        }

        boolean sawTopLevelKeyword = language.get().requiredTopLevelKeywords().stream()
                .anyMatch(keyword -> containsWord(text, keyword));
        if (!sawTopLevelKeyword) {
            diagnostics.add(diagnostic(
                    0,
                    0,
                    0,
                    Math.min(Math.max(text.length(), 1), 32),
                    1,
                    "kide.missing-top-level",
                    "Expected one of the top-level declarations: "
                            + String.join(", ", language.get().requiredTopLevelKeywords())));
        }

        validateBrackets(text, diagnostics);
        return diagnostics;
    }

    private static boolean containsWord(String text, String keyword) {
        int index = text.indexOf(keyword);
        while (index >= 0) {
            boolean left = index == 0 || !Character.isJavaIdentifierPart(text.charAt(index - 1));
            int end = index + keyword.length();
            boolean right = end >= text.length() || !Character.isJavaIdentifierPart(text.charAt(end));
            if (left && right) return true;
            index = text.indexOf(keyword, index + 1);
        }
        return false;
    }

    private static void validateBrackets(String text, ArrayNode diagnostics) {
        Deque<OpenBracket> stack = new ArrayDeque<>();
        boolean inString = false;
        boolean escaped = false;
        boolean lineComment = false;
        boolean blockComment = false;
        int line = 0;
        int character = 0;

        for (int i = 0; i < text.length(); i++) {
            char current = text.charAt(i);
            char next = i + 1 < text.length() ? text.charAt(i + 1) : '\0';

            if (current == '\n') {
                line++;
                character = 0;
                lineComment = false;
                continue;
            }

            if (lineComment) {
                character++;
                continue;
            }

            if (blockComment) {
                if (current == '*' && next == '/') {
                    blockComment = false;
                    i++;
                    character += 2;
                } else {
                    character++;
                }
                continue;
            }

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (current == '\\') {
                    escaped = true;
                } else if (current == '"') {
                    inString = false;
                }
                character++;
                continue;
            }

            if (current == '/' && next == '/') {
                lineComment = true;
                i++;
                character += 2;
                continue;
            }
            if (current == '/' && next == '*') {
                blockComment = true;
                i++;
                character += 2;
                continue;
            }
            if (current == '"') {
                inString = true;
                character++;
                continue;
            }

            if (current == '{' || current == '[' || current == '(') {
                stack.push(new OpenBracket(current, new Position(line, character)));
            } else if (current == '}' || current == ']' || current == ')') {
                char expected = switch (current) {
                    case '}' -> '{';
                    case ']' -> '[';
                    default -> '(';
                };
                if (stack.isEmpty() || stack.peek().symbol() != expected) {
                    diagnostics.add(diagnostic(
                            line,
                            character,
                            line,
                            character + 1,
                            1,
                            "kide.unmatched-closing-bracket",
                            "Unmatched closing bracket '" + current + "'."));
                } else {
                    stack.pop();
                }
            }
            character++;
        }

        while (!stack.isEmpty()) {
            OpenBracket open = stack.removeLast();
            diagnostics.add(diagnostic(
                    open.position().line(),
                    open.position().character(),
                    open.position().line(),
                    open.position().character() + 1,
                    1,
                    "kide.unclosed-bracket",
                    "Opening bracket '" + open.symbol() + "' is not closed."));
        }
    }

    private static ObjectNode diagnostic(
            int startLine,
            int startCharacter,
            int endLine,
            int endCharacter,
            int severity,
            String code,
            String message) {
        ObjectNode diagnostic = JSON.createObjectNode();
        ObjectNode range = diagnostic.putObject("range");
        range.putObject("start").put("line", startLine).put("character", startCharacter);
        range.putObject("end").put("line", endLine).put("character", endCharacter);
        diagnostic.put("severity", severity);
        diagnostic.put("code", code);
        diagnostic.put("source", "KIDE language service");
        diagnostic.put("message", message);
        return diagnostic;
    }
}
