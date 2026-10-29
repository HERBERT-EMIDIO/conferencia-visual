</main>
<footer class="app-footer">
    <div class="container">Leitura automática de manuscrito deve ser conferida antes de gravar.</div>
</footer>
<?php foreach ($scripts ?? [] as $src): ?>
<script src="<?= htmlspecialchars($src, ENT_QUOTES, 'UTF-8') ?>"></script>
<?php endforeach; ?>
</body>
</html>
