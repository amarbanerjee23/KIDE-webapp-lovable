package com.kide.lsp;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

public final class LanguageCatalog {
    public record LanguageSpec(
            String extension,
            String languageId,
            List<String> requiredTopLevelKeywords,
            List<String> completionKeywords) {}

    private static final Map<String, LanguageSpec> BY_EXTENSION = new LinkedHashMap<>();

    static {
        register(new LanguageSpec(
                "dml",
                "kide-dml",
                List.of("Package", "DataModel"),
                List.of("Package", "DataModel", "primitives", "composites")));
        register(new LanguageSpec(
                "op",
                "kide-op",
                List.of("Operation"),
                List.of("Operation", "execute", "return")));
        register(new LanguageSpec(
                "mncspec",
                "kide-mnc",
                List.of("Model"),
                List.of(
                        "Model",
                        "InterfaceDescription",
                        "ControlNode",
                        "commands",
                        "events",
                        "alarms",
                        "responses",
                        "dataPoints",
                        "operatingStates",
                        "Validate",
                        "transition")));
        register(new LanguageSpec(
                "cap",
                "kide-cap",
                List.of("Capability"),
                List.of(
                        "Capability",
                        "compatible",
                        "Init",
                        "providesControlCapabilities",
                        "providesOutcomes",
                        "fireable",
                        "receivable",
                        "raised",
                        "subscribable")));
        register(new LanguageSpec(
                "activity",
                "kide-activity",
                List.of("ActivityDiagram"),
                List.of(
                        "ActivityDiagram",
                        "Activity",
                        "activities",
                        "requireCapability",
                        "requireOperation",
                        "inputData",
                        "conditions",
                        "nextActivity",
                        "interruptedBy",
                        "interrupts",
                        "time",
                        "final")));
    }

    private LanguageCatalog() {}

    private static void register(LanguageSpec spec) {
        BY_EXTENSION.put(spec.extension(), spec);
    }

    public static Optional<LanguageSpec> fromUri(String uri) {
        if (uri == null || uri.isBlank()) return Optional.empty();
        try {
            String path = URI.create(uri).getPath();
            if (path == null) return Optional.empty();
            int dot = path.lastIndexOf('.');
            if (dot < 0 || dot == path.length() - 1) return Optional.empty();
            return fromExtension(path.substring(dot + 1));
        } catch (IllegalArgumentException ignored) {
            return Optional.empty();
        }
    }

    public static Optional<LanguageSpec> fromExtension(String extension) {
        if (extension == null) return Optional.empty();
        return Optional.ofNullable(BY_EXTENSION.get(extension.toLowerCase(Locale.ROOT)));
    }

    public static List<String> supportedLanguageIds() {
        return BY_EXTENSION.values().stream().map(LanguageSpec::languageId).toList();
    }
}
