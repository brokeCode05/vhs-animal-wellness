<?php
namespace App\Http\Controllers;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
final class ProfilePhotoController extends Controller {
    public function show(Request $r, User $user) {
        abort_unless($r->user()->id === $user->id || $r->user()->role === 'Admin', 403, 'Access denied.');
        abort_unless($user->photo_path && Storage::disk('local')->exists($user->photo_path), 404);
        return Storage::disk('local')->response($user->photo_path, null, ['Cache-Control'=>'private, no-store', 'X-Content-Type-Options'=>'nosniff']);
    }
}
