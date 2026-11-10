<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AnnouncementsController extends Controller
{
    use ApiResponse;

    private function present(Announcement $announcement): array
    {
        return [
            'announcementId' => $announcement->id,
            'title' => $announcement->title,
            'message' => $announcement->message,
            'badgeType' => $announcement->badge_type,
            'active' => (bool) $announcement->active,
            'createdAt' => optional($announcement->created_at)->toIso8601String(),
            'updatedAt' => optional($announcement->updated_at)->toIso8601String(),
        ];
    }

    /**
     * Authenticated client-facing feed.
     * Only active announcements are exposed.
     */
    public function index()
    {
        $rows = Announcement::query()
            ->where('active', true)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (Announcement $announcement) => $this->present($announcement))
            ->values();

        return $this->ok('Announcements loaded.', [
            'announcements' => $rows,
        ]);
    }

    /**
     * Admin management feed includes both active and inactive records.
     */
    public function manage()
    {
        $rows = Announcement::query()
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Announcement $announcement) => $this->present($announcement))
            ->values();

        return $this->ok('Announcement management list loaded.', [
            'announcements' => $rows,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'max:1000'],
            'badgeType' => ['sometimes', Rule::in(['new', 'info'])],
            'active' => ['sometimes', 'boolean'],
        ]);

        $announcement = DB::transaction(function () use ($request, $validated) {
            $announcement = new Announcement;
            $announcement->forceFill([
                'title' => trim($validated['title']),
                'message' => trim($validated['message']),
                'badge_type' => $validated['badgeType'] ?? 'info',
                'active' => array_key_exists('active', $validated)
                    ? (bool) $validated['active']
                    : true,
            ])->save();

            AuditWriter::write(
                $request->user(),
                'announcement_created',
                'announcement',
                $announcement->id,
                $request->user()->name . ' created announcement ' . $announcement->title . '.',
                null,
                ['announcement' => $this->present($announcement)]
            );

            return $announcement;
        });

        return $this->ok('Announcement created.', [
            'announcement' => $this->present($announcement),
        ], 201);
    }

    public function update(Request $request, Announcement $announcement)
    {
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:120'],
            'message' => ['sometimes', 'required', 'string', 'max:1000'],
            'badgeType' => ['sometimes', Rule::in(['new', 'info'])],
            'active' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($request, $announcement, $validated) {
            $before = $this->present($announcement);

            if (array_key_exists('title', $validated)) {
                $announcement->title = trim($validated['title']);
            }
            if (array_key_exists('message', $validated)) {
                $announcement->message = trim($validated['message']);
            }
            if (array_key_exists('badgeType', $validated)) {
                $announcement->badge_type = $validated['badgeType'];
            }
            if (array_key_exists('active', $validated)) {
                $announcement->active = (bool) $validated['active'];
            }

            $announcement->save();

            AuditWriter::write(
                $request->user(),
                'announcement_updated',
                'announcement',
                $announcement->id,
                $request->user()->name . ' updated announcement ' . $announcement->title . '.',
                null,
                [
                    'previous' => $before,
                    'new' => $this->present($announcement),
                ]
            );
        });

        return $this->ok('Announcement updated.', [
            'announcement' => $this->present($announcement->fresh()),
        ]);
    }

    public function destroy(Request $request, Announcement $announcement)
    {
        DB::transaction(function () use ($request, $announcement) {
            $id = $announcement->id;
            $title = $announcement->title;
            $snapshot = $this->present($announcement);

            $announcement->delete();

            AuditWriter::write(
                $request->user(),
                'announcement_deleted',
                'announcement',
                $id,
                $request->user()->name . ' deleted announcement ' . $title . '.',
                null,
                ['announcement' => $snapshot]
            );
        });

        return $this->ok('Announcement deleted.');
    }

}
