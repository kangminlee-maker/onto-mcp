Import-Module Az.Accounts

# Returns a greeting for the given name.
function Get-Greeting {
    param([string]$Name)
    "Hello, $Name"
}

function Set-Config {
    param([hashtable]$Values)
    $script:Config = $Values
}

class Widget {
    [int]$Id
    [string]$Label
}

$MaxItems = 100
