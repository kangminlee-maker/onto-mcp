// Package inventory tracks stock levels for the warehouse.
package inventory

import (
	"errors"
	"fmt"
)

import "strings"

// ErrOutOfStock is returned when a withdrawal exceeds the balance.
var ErrOutOfStock = errors.New("out of stock")

const MaxBatch = 100

// Ledger is an append-only record of stock movements.
type Ledger struct {
	Name    string
	balance int
}

// Reader observes a ledger balance.
type Reader interface {
	Balance() int
}

// Withdraw removes n units, failing when the balance is insufficient.
func (l *Ledger) Withdraw(n int) error {
	if n > l.balance {
		return fmt.Errorf("%w: %s", ErrOutOfStock, strings.ToUpper(l.Name))
	}
	l.balance -= n
	return nil
}

func NewLedger(name string) *Ledger {
	return &Ledger{Name: name}
}
