-- greeter module: builds greeting strings
local Greeter = {}

function Greeter.new(prefix)
  local self = { prefix = prefix }
  return self
end

function Greeter.greet(self, name)
  return self.prefix .. " " .. name
end

return Greeter
