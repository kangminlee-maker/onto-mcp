using System;
using System.Collections.Generic;
using static System.Math;

namespace Example.Inventory;

/// <summary>Coordinates inventory operations.</summary>
public class UserService
{
    private readonly string region;

    public UserService(string region)
    {
        this.region = region;
    }

    public double Round2(double value) => Round(value, 2);
}

public interface IAuditSink
{
    void Record(string evt);
}

public enum Severity
{
    Low,
    High
}

public struct Point
{
    public int X;
    public int Y;
}
