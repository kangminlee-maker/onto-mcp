package com.example.inventory

import java.util.UUID
import kotlin.collections.List as KList

const val MAX_BATCH = 100

/** An append-only ledger of stock movements. */
class Ledger(val name: String) {
    private var balance: Int = 0

    fun withdraw(n: Int): Boolean {
        if (n > balance) return false
        balance -= n
        return true
    }
}

interface Reader {
    fun balance(): Int
}

object Registry {
    fun lookup(id: UUID): Ledger? {
        return null
    }
}

enum class Severity {
    LOW,
    HIGH
}

data class Point(val x: Int, val y: Int)

fun newLedger(name: String): Ledger {
    return Ledger(name)
}
