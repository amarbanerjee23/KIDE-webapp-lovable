package com.kide.lsp;

import java.net.InetSocketAddress;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

public final class Main {
    private Main() {}

    public static void main(String[] args) throws Exception {
        String bindHost = env("KIDE_LSP_BIND_HOST", "0.0.0.0");
        int healthPort = envInt("KIDE_HEALTH_PORT", 8080);
        int lspPort = envInt("KIDE_LSP_PORT", 8081);
        int maxMessageBytes = envInt(
                "KIDE_LSP_MAX_MESSAGE_BYTES",
                KideWebSocketServer.DEFAULT_MAX_MESSAGE_BYTES);
        OriginPolicy origins = new OriginPolicy(System.getenv("KIDE_LSP_ALLOWED_ORIGINS"));
        AtomicBoolean ready = new AtomicBoolean(false);

        HealthServer health = new HealthServer(new InetSocketAddress(bindHost, healthPort), ready);
        KideWebSocketServer lsp = new KideWebSocketServer(
                new InetSocketAddress(bindHost, lspPort),
                origins,
                maxMessageBytes,
                ready);

        health.start();
        lsp.start();

        CountDownLatch shutdown = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            ready.set(false);
            try {
                lsp.stop(1_000);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            health.close();
            shutdown.countDown();
        }, "kide-lsp-shutdown"));

        shutdown.await();
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static int envInt(String name, int fallback) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) return fallback;
        try {
            int parsed = Integer.parseInt(value);
            if (parsed <= 0) throw new NumberFormatException("non-positive");
            return parsed;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(name + " must be a positive integer", exception);
        }
    }
}
