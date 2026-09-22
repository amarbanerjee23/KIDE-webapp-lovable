package com.kide.lsp;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class DocumentStore {
    public record Document(String uri, String languageId, int version, String text) {}

    private final Map<String, Document> documents = new ConcurrentHashMap<>();

    public void open(String uri, String languageId, int version, String text) {
        documents.put(uri, new Document(uri, languageId, version, text));
    }

    public void change(String uri, int version, String text) {
        documents.computeIfPresent(uri, (key, current) ->
                new Document(uri, current.languageId(), version, text));
    }

    public Document get(String uri) {
        return documents.get(uri);
    }

    public void close(String uri) {
        documents.remove(uri);
    }
}
