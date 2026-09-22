package com.kide.lsp;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

public final class HealthServer implements AutoCloseable {
    private final HttpServer server;
    private final AtomicBoolean ready;

    public HealthServer(InetSocketAddress address, AtomicBoolean ready) throws IOException {
        this.server = HttpServer.create(address, 16);
        this.ready = ready;
        server.createContext("/healthz", exchange -> respond(exchange, 200, "{\"status\":\"ok\"}"));
        server.createContext(
                "/readyz",
                exchange -> {
                    if (ready.get()) {
                        respond(exchange, 200, "{\"status\":\"ready\"}");
                    } else {
                        respond(exchange, 503, "{\"status\":\"starting\"}");
                    }
                });
    }

    public void start() {
        server.start();
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            status = 405;
            body = "{\"error\":\"method not allowed\"}";
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
