package com.kide.lsp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;

public final class JsonRpcSession {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final DocumentStore documents;
    private final DocumentValidator validator;

    public JsonRpcSession() {
        this(new DocumentStore(), new DocumentValidator());
    }

    JsonRpcSession(DocumentStore documents, DocumentValidator validator) {
        this.documents = documents;
        this.validator = validator;
    }

    public List<String> handle(String message) {
        final JsonNode request;
        try {
            request = JSON.readTree(message);
        } catch (JsonProcessingException exception) {
            return List.of(serialize(error(null, -32700, "Parse error")));
        }

        if (request == null || !request.isObject()) {
            return List.of(serialize(error(request == null ? null : request.get("id"), -32600, "Invalid Request")));
        }

        JsonNode id = request.get("id");
        JsonNode methodNode = request.get("method");
        if (methodNode == null || !methodNode.isTextual()) {
            return id == null
                    ? List.of()
                    : List.of(serialize(error(id, -32600, "Invalid Request")));
        }

        String method = methodNode.asText();
        JsonNode params = request.path("params");

        try {
            return switch (method) {
                case "initialize" -> responseOnly(id, initializeResult());
                case "initialized" -> List.of();
                case "shutdown" -> responseOnly(id, null);
                case "exit" -> List.of();
                case "textDocument/didOpen" -> didOpen(params);
                case "textDocument/didChange" -> didChange(params);
                case "textDocument/didClose" -> didClose(params);
                case "textDocument/completion" -> responseOnly(id, completion(params));
                case "textDocument/hover" -> responseOnly(id, null);
                default -> id == null
                        ? List.of()
                        : List.of(serialize(error(id, -32601, "Method not found: " + method)));
            };
        } catch (IllegalArgumentException exception) {
            return id == null
                    ? List.of()
                    : List.of(serialize(error(id, -32602, exception.getMessage())));
        }
    }

    private static ObjectNode initializeResult() {
        ObjectNode result = JSON.createObjectNode();
        ObjectNode capabilities = result.putObject("capabilities");
        capabilities.put("textDocumentSync", 1);
        capabilities.put("hoverProvider", true);
        ArrayNode triggers = capabilities.putObject("completionProvider").putArray("triggerCharacters");
        triggers.add(":").add(" ").add(",").add("{");

        ObjectNode experimental = capabilities.putObject("experimental");
        ArrayNode languageIds = experimental.putArray("kideLanguageIds");
        LanguageCatalog.supportedLanguageIds().forEach(languageIds::add);
        experimental.put("transport", "websocket-jsonrpc");

        result.putObject("serverInfo")
                .put("name", "KIDE Language Service")
                .put("version", "0.1.0");
        return result;
    }

    private List<String> didOpen(JsonNode params) {
        JsonNode document = requiredObject(params, "textDocument");
        String uri = requiredText(document, "uri");
        String languageId = optionalText(document, "languageId", "");
        int version = document.path("version").asInt(0);
        String text = optionalText(document, "text", "");
        documents.open(uri, languageId, version, text);
        return List.of(serialize(publishDiagnostics(uri, validator.validate(uri, text))));
    }

    private List<String> didChange(JsonNode params) {
        JsonNode document = requiredObject(params, "textDocument");
        String uri = requiredText(document, "uri");
        int version = document.path("version").asInt(0);
        JsonNode changes = params.path("contentChanges");
        if (!changes.isArray() || changes.isEmpty()) {
            throw new IllegalArgumentException("contentChanges must contain a full document update");
        }
        String text = optionalText(changes.get(changes.size() - 1), "text", "");
        documents.change(uri, version, text);
        DocumentStore.Document current = documents.get(uri);
        if (current == null) {
            documents.open(uri, "", version, text);
        }
        return List.of(serialize(publishDiagnostics(uri, validator.validate(uri, text))));
    }

    private List<String> didClose(JsonNode params) {
        JsonNode document = requiredObject(params, "textDocument");
        String uri = requiredText(document, "uri");
        documents.close(uri);
        return List.of(serialize(publishDiagnostics(uri, JSON.createArrayNode())));
    }

    private ObjectNode completion(JsonNode params) {
        JsonNode document = requiredObject(params, "textDocument");
        String uri = requiredText(document, "uri");
        var language = LanguageCatalog.fromUri(uri);

        ObjectNode result = JSON.createObjectNode();
        result.put("isIncomplete", false);
        ArrayNode items = result.putArray("items");
        if (language.isEmpty()) return result;

        for (String keyword : language.get().completionKeywords()) {
            ObjectNode item = items.addObject();
            item.put("label", keyword);
            item.put("kind", 14);
            item.put("detail", "KIDE keyword");
            item.put("insertText", keyword);
        }
        return result;
    }

    private static ObjectNode publishDiagnostics(String uri, ArrayNode diagnostics) {
        ObjectNode notification = JSON.createObjectNode();
        notification.put("jsonrpc", "2.0");
        notification.put("method", "textDocument/publishDiagnostics");
        ObjectNode params = notification.putObject("params");
        params.put("uri", uri);
        params.set("diagnostics", diagnostics);
        return notification;
    }

    private static List<String> responseOnly(JsonNode id, JsonNode result) {
        if (id == null) return List.of();
        return List.of(serialize(response(id, result)));
    }

    private static ObjectNode response(JsonNode id, JsonNode result) {
        ObjectNode response = JSON.createObjectNode();
        response.put("jsonrpc", "2.0");
        response.set("id", id);
        if (result == null) {
            response.putNull("result");
        } else {
            response.set("result", result);
        }
        return response;
    }

    private static ObjectNode error(JsonNode id, int code, String message) {
        ObjectNode response = JSON.createObjectNode();
        response.put("jsonrpc", "2.0");
        if (id == null) {
            response.putNull("id");
        } else {
            response.set("id", id);
        }
        response.putObject("error").put("code", code).put("message", message);
        return response;
    }

    private static JsonNode requiredObject(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isObject()) {
            throw new IllegalArgumentException(field + " must be an object");
        }
        return node;
    }

    private static String requiredText(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isTextual() || node.asText().isBlank()) {
            throw new IllegalArgumentException(field + " must be a non-empty string");
        }
        return node.asText();
    }

    private static String optionalText(JsonNode parent, String field, String fallback) {
        JsonNode node = parent.path(field);
        return node.isTextual() ? node.asText() : fallback;
    }

    private static String serialize(JsonNode node) {
        try {
            return JSON.writeValueAsString(node);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to serialize JSON-RPC response", exception);
        }
    }
}
