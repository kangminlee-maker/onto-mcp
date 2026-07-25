package com.example.inventory;

import java.util.List;
import java.util.Map;
import static java.util.Collections.emptyList;

/** Coordinates inventory operations for a single warehouse. */
public class UserService {
    private final String region;
    private final Map<String, Integer> balances;

    public UserService(String region, Map<String, Integer> balances) {
        this.region = region;
        this.balances = balances;
    }

    public List<String> lowStock(int threshold) {
        return emptyList();
    }
}

interface AuditSink {
    void record(String event);
}

enum Severity {
    LOW,
    HIGH
}
