package com.kide.lsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class LanguageCatalogTest {
    @Test
    void resolvesRegisteredExtensionsFromUris() {
        assertEquals(
                "kide-mnc",
                LanguageCatalog.fromUri("file:///workspace/Fleet.MNCSPEC")
                        .orElseThrow()
                        .languageId());
        assertEquals(
                "kide-activity",
                LanguageCatalog.fromUri("file:///workspace/Mission.activity")
                        .orElseThrow()
                        .languageId());
    }

    @Test
    void unknownOrMalformedUrisAreRejected() {
        assertTrue(LanguageCatalog.fromUri("file:///workspace/readme.txt").isEmpty());
        assertTrue(LanguageCatalog.fromUri("://bad uri").isEmpty());
    }
}
