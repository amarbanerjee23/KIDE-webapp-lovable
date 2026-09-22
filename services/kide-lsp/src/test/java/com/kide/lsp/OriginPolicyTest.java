package com.kide.lsp;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class OriginPolicyTest {
    @Test
    void exactOriginsAreAllowedAndOtherBrowserOriginsAreRejected() {
        OriginPolicy policy = new OriginPolicy("https://kide.example.com, http://localhost:5173");

        assertTrue(policy.allows("https://kide.example.com"));
        assertTrue(policy.allows("http://localhost:5173"));
        assertFalse(policy.allows("https://evil.example.com"));
    }

    @Test
    void missingOriginIsAllowedForNonBrowserClients() {
        OriginPolicy policy = new OriginPolicy("");
        assertTrue(policy.allows(null));
        assertTrue(policy.allows(""));
        assertFalse(policy.allows("https://browser.example.com"));
    }

    @Test
    void wildcardMustBeExplicit() {
        OriginPolicy policy = new OriginPolicy("*");
        assertTrue(policy.allows("https://any.example.com"));
    }
}
