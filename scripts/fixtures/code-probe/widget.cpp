#include <string>
#include <vector>
#include "widget.h"

namespace ui {

// A rectangular on-screen widget.
class Widget {
public:
    Widget(int id);
    int getId() const;

private:
    int id_;
    std::string label_;
};

struct Config {
    int timeout;
    bool retina;
};

enum Color { RED, GREEN, BLUE };

int g_widget_count = 0;

void render(const Widget& w) {
    g_widget_count += 1;
}

}
