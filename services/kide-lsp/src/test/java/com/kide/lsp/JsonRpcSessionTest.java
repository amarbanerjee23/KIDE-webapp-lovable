package com.kide.lsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class JsonRpcSessionTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void initializeAdvertisesFullSyncAndAllKideLanguageIds() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        JsonNode response = single(session.handle(
                "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}"));

        assertEquals(1, response.at("/result/capabilities/textDocumentSync").asInt());
        assertTrue(response.at("/result/capabilities/hoverProvider").asBoolean());
        List<String> ids = JSON.convertValue(
                response.at("/result/capabilities/experimental/kideLanguageIds"),
                JSON.getTypeFactory().constructCollectionType(List.class, String.class));
        assertEquals(
                List.of("kide-dml", "kide-op", "kide-mnc", "kide-cap", "kide-activity"),
                ids);
    }

    @Test
    void didOpenPublishesBracketDiagnostics() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        JsonNode notification = single(session.handle(
                """
                {"jsonrpc":"2.0","method":"textDocument/didOpen","params":{
                  "textDocument":{
                    "uri":"file:///workspace/device.mncspec",
                    "languageId":"kide-mnc",
                    "version":1,
                    "text":"Model Demo {"
                  }
                }}
                """));

        assertEquals("textDocument/publishDiagnostics", notification.path("method").asText());
        assertEquals("kide.unclosed-bracket",
                notification.at("/params/diagnostics/0/code").asText());
    }

    @Test
    void fullDocumentChangeClearsDiagnosticsWhenDocumentIsFixed() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        session.handle(
                """
                {"jsonrpc":"2.0","method":"textDocument/didOpen","params":{
                  "textDocument":{
                    "uri":"file:///workspace/device.mncspec",
                    "languageId":"kide-mnc",
                    "version":1,
                    "text":"Model Demo {"
                  }
                }}
                """);

        JsonNode notification = single(session.handle(
                """
                {"jsonrpc":"2.0","method":"textDocument/didChange","params":{
                  "textDocument":{"uri":"file:///workspace/device.mncspec","version":2},
                  "contentChanges":[{"text":"Model Demo {}"}]
                }}
                """));

        assertEquals(0, notification.at("/params/diagnostics").size());
    }

    @Test
    void completionUsesLanguageSpecificKeywords() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        JsonNode response = single(session.handle(
                """
                {"jsonrpc":"2.0","id":"complete-1","method":"textDocument/completion","params":{
                  "textDocument":{"uri":"file:///workspace/mission.activity"},
                  "position":{"line":0,"character":0}
                }}
                """));

        assertEquals("complete-1", response.path("id").asText());
        assertTrue(response.at("/result/items").toString().contains("ActivityDiagram"));
        assertTrue(response.at("/result/items").toString().contains("requireCapability"));
    }

    @Test
    void unknownRequestReturnsMethodNotFound() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        JsonNode response = single(session.handle(
                "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"workspace/executeCommand\",\"params\":{}}"));

        assertEquals(-32601, response.at("/error/code").asInt());
    }

    @Test
    void malformedJsonReturnsParseError() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        JsonNode response = single(session.handle("{not-json"));

        assertEquals(-32700, response.at("/error/code").asInt());
        assertTrue(response.path("id").isNull());
    }

    @Test
    void missingTopLevelDeclarationIsReported() throws Exception {
        JsonRpcSession session = new JsonRpcSession();
        JsonNode notification = single(session.handle(
                """
                {"jsonrpc":"2.0","method":"textDocument/didOpen","params":{
                  "textDocument":{
                    "uri":"file:///workspace/model.cap",
                    "languageId":"kide-cap",
                    "version":1,
                    "text":"Init {}"
                  }
                }}
                """));

        assertEquals("kide.missing-top-level",
                notification.at("/params/diagnostics/0/code").asText());
    }

    private static JsonNode single(List<String> messages) throws Exception {
        assertEquals(1, messages.size());
        return JSON.readTree(messages.get(0));
    }
}
