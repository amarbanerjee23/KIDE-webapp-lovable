package com.kide.lsp;

import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public final class KideWebSocketServer extends WebSocketServer {
    public static final String ENDPOINT = "/lsp/kide";
    public static final int DEFAULT_MAX_MESSAGE_BYTES = 1_048_576;

    private final OriginPolicy originPolicy;
    private final int maxMessageBytes;
    private final AtomicBoolean ready;
    private final Map<WebSocket, JsonRpcSession> sessions = new ConcurrentHashMap<>();

    public KideWebSocketServer(
            InetSocketAddress address,
            OriginPolicy originPolicy,
            int maxMessageBytes,
            AtomicBoolean ready) {
        super(address);
        this.originPolicy = originPolicy;
        this.maxMessageBytes = maxMessageBytes;
        this.ready = ready;
        setConnectionLostTimeout(30);
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        if (!ENDPOINT.equals(handshake.getResourceDescriptor())) {
            connection.close(1008, "Unsupported WebSocket path");
            return;
        }

        String origin = handshake.getFieldValue("Origin");
        if (!originPolicy.allows(origin)) {
            connection.close(1008, "Origin is not allowed");
            return;
        }

        sessions.put(connection, new JsonRpcSession());
    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        if (message.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > maxMessageBytes) {
            connection.close(1009, "LSP message exceeds configured limit");
            return;
        }

        JsonRpcSession session = sessions.get(connection);
        if (session == null) {
            connection.close(1008, "LSP session is not initialized");
            return;
        }

        for (String response : session.handle(message)) {
            connection.send(response);
        }
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        sessions.remove(connection);
    }

    @Override
    public void onError(WebSocket connection, Exception exception) {
        System.err.println("[KIDE LSP] WebSocket error: " + exception.getMessage());
    }

    @Override
    public void onStart() {
        ready.set(true);
        System.out.println("[KIDE LSP] WebSocket endpoint ready at " + ENDPOINT);
    }
}
