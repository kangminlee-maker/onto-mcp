require 'json'
require_relative 'audit_log'

# Maximum retained sessions per user.
MAX_SESSIONS = 5

# User is a person authenticated against the directory.
class User
  attr_reader :name

  def initialize(name)
    @name = name
  end

  # greet returns a localized greeting.
  def greet
    "Hello, #{@name}"
  end
end

# Auth holds directory login helpers.
module Auth
  def self.login(user)
    user.greet
  end
end

def build_user(name)
  User.new(name)
end
