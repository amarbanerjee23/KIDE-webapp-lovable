package com.kide.lsp;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

public final class OriginPolicy {
    private final Set<String> allowedOrigins;

    public OriginPolicy(String configuredOrigins) {
        this.allowedOrigins = Arrays.stream(configuredOrigins == null ? new String[0] : configuredOrigins.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean allows(String origin) {
        if (origin == null || origin.isBlank()) return true;
        return allowedOrigins.contains("*") || allowedOrigins.contains(origin);
    }
}
