<?php

namespace App\Http;

use App\Models\User;
use App\Services\Auth as AuthService;

require_once 'bootstrap.php';

/** Handles user-facing HTTP endpoints. */
class UserController
{
    private $repo;

    public function __construct($repo)
    {
        $this->repo = $repo;
    }

    public function index()
    {
        return $this->repo->all();
    }
}

interface Repository
{
    public function all();
}

trait Loggable
{
    public function log($message) {}
}

function make_controller($repo)
{
    return new UserController($repo);
}

const API_VERSION = "2.1";
