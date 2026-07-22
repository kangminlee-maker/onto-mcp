use std::f64::consts::PI;
use std::fmt::{self, Display};

/// A geometric point.
pub struct Point {
    x: f64,
    y: f64,
}

/// The kinds of shape the renderer understands.
pub enum Shape {
    Circle(f64),
    Rect { w: f64, h: f64 },
}

/// Anything with a computable area.
pub trait Area {
    fn area(&self) -> f64;
}

impl Area for Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle(r) => PI * r * r,
            Shape::Rect { w, h } => w * h,
        }
    }
}

const ORIGIN_LABEL: &str = "origin";

pub fn distance(a: &Point, b: &Point) -> f64 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}
